#!/usr/bin/env python3
"""Validate catalog agreement, package structure, links, locks, and public hygiene."""

from __future__ import annotations

import argparse
from datetime import date
import hashlib
import importlib.util
import os
from pathlib import Path
import re
import selectors
import stat
import subprocess
import sys

sys.dont_write_bytecode = True
REPOSITORY = Path(__file__).absolute().parent.parent
SPEC = importlib.util.spec_from_file_location(
    "skill_tools", REPOSITORY / ".agents" / "skills" / "skill-creator" / "scripts" / "skill_tools.py")
assert SPEC is not None and SPEC.loader is not None
skill_tools = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(skill_tools)

IGNORED_NAMES = frozenset({"__pycache__"})
IGNORED_ROOT_NAMES = frozenset({".git", ".venv", ".pytest_cache", ".work", "tmp"})
REPOSITORY_ALIASES = {
    "CLAUDE.md": "AGENTS.md",
    ".claude/skills": "../.agents/skills",
    ".github/skills": "../.agents/skills",
}
PUBLIC_PATTERNS = (
    ("private key material", re.compile(r"-----BEGIN " + r"(?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----")),
    ("cloud access credential", re.compile(r"\bAKIA[A-Z0-9]{16}\b")),
    ("GitHub credential", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{36,255}\b|\bgithub_pat_[A-Za-z0-9_]{22,255}\b")),
    ("API credential", re.compile(r"\bsk-(?:proj-)?[A-Za-z0-9_-]{40,}\b")),
    ("authenticated URL", re.compile(r"https?://[^\s/:]+:[^\s/@]+@")),
    ("private local path", re.compile(r"/(?:Us" + r"ers|ho" + r"me)/[A-Za-z0-9_.-]+(?:/|\b)|[A-Za-z]:\\(?:Us" + r"ers)\\")),
)


class RepositoryRoot(skill_tools.SafeRoot):
    """Permit only reviewed collection aliases, without traversing their links."""

    def check_alias(self, relative: str, target: str) -> str:
        parts = skill_tools.relative_parts(relative)
        directory = self.directory_fd(parts[:-1])
        try:
            metadata = os.stat(parts[-1], dir_fd=directory, follow_symlinks=False)
            skill_tools.require(stat.S_ISLNK(metadata.st_mode), f"repository alias must be a symlink: {relative}")
            skill_tools.require(os.readlink(parts[-1], dir_fd=directory) == target,
                                f"unexpected repository alias target: {relative}")
        finally:
            os.close(directory)
        canonical = skill_tools.local_link_path(relative, target)
        skill_tools.require(canonical is not None, "repository alias must name a local target")
        super().info(canonical)
        return canonical

    def info(self, relative: str):
        for alias, target in REPOSITORY_ALIASES.items():
            if relative == alias or relative.startswith(alias + "/"):
                canonical = self.check_alias(alias, target)
                relative = canonical + relative[len(alias):]
                break
        return super().info(relative)


def check_public_hygiene(relative: str, text: str) -> None:
    for label, pattern in PUBLIC_PATTERNS:
        match = pattern.search(text)
        if match:
            line = text.count("\n", 0, match.start()) + 1
            # Never echo the matched bytes, which might be an actual credential.
            raise skill_tools.ValidationError(f"{relative}:{line}: possible {label}; inspect and sanitize")


def reject_tracked_scratch(path: Path) -> None:
    """Consult the index without reading scratch files or returning their names."""
    if not (path / ".git").exists():
        return  # An exported tree has no index; its publication source needs review.
    environment = os.environ.copy()
    environment["GIT_CONFIG_NOSYSTEM"] = "1"
    environment["GIT_CONFIG_GLOBAL"] = os.devnull
    process = subprocess.Popen(
        ["git", "--no-optional-locks", "-c", "core.fsmonitor=false", "-C", str(path),
         "ls-files", "-z", "--", ".work", "tmp"],
        stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=environment)
    assert process.stdout is not None
    try:
        with selectors.DefaultSelector() as selector:
            selector.register(process.stdout, selectors.EVENT_READ)
            skill_tools.require(bool(selector.select(timeout=10)), "timed out inspecting the Git index for tracked scratch")
            first_byte = os.read(process.stdout.fileno(), 1)
        skill_tools.require(not first_byte, "root .work/ and tmp/ scratch must not be tracked; remove them from the publication index")
        skill_tools.require(process.wait(timeout=5) == 0, "cannot inspect the Git index for tracked scratch")
    finally:
        process.stdout.close()
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()


def validate_lock(value: object, names: set[str]) -> int:
    t = skill_tools
    data = t.fields(value, {"schema_version", "observed_on", "hash_algorithm", "sources"}, "upstream lock")
    t.require(type(data["schema_version"]) is int and data["schema_version"] == 1,
              "upstream lock schema_version must be 1")
    t.require(data["hash_algorithm"] == "sha256", "upstream lock hash_algorithm must be sha256")
    try:
        date.fromisoformat(data["observed_on"])
    except (TypeError, ValueError) as error:
        raise t.ValidationError("upstream lock observed_on must be an ISO date") from error
    sources = data["sources"]
    t.require(isinstance(sources, list) and 0 < len(sources) <= 128,
              "upstream lock sources must contain between 1 and 128 entries")
    identifiers = set()
    for source in sources:
        source = t.fields(source, {"id", "repository", "revision", "package_path", "license", "license_path",
                                   "license_sha256", "reuse", "consumers", "files", "package_sha256"}, "locked source")
        identifier = t.valid_slug(source["id"], "locked source id")
        t.require(identifier not in identifiers, "locked source IDs must be distinct")
        identifiers.add(identifier)
        repository = t.nonblank(source["repository"], "locked repository", 2048)
        parsed = t.urlsplit(repository)
        t.require(parsed.scheme == "https" and bool(parsed.hostname) and not parsed.username
                  and not parsed.password and not parsed.query and not parsed.fragment,
                  "locked repository must be a public HTTPS URL")
        t.require(isinstance(source["revision"], str) and bool(t.REVISION.fullmatch(source["revision"])),
                  "locked source revision must be an immutable 40/64-hex commit")
        t.relative_parts(source["package_path"])
        t.relative_parts(source["license_path"])
        t.nonblank(source["license"], "locked source license", 256)
        t.require(source["reuse"] in ("pattern", "adapt", "reference", "reject"), "invalid locked source reuse")
        for key in ("license_sha256", "package_sha256"):
            t.require(isinstance(source[key], str) and bool(t.SHA256.fullmatch(source[key])),
                      f"locked source {key} must be a lowercase SHA-256")
        consumers = source["consumers"]
        t.require(isinstance(consumers, list) and len(consumers) <= len(names), "invalid locked source consumers")
        t.require(all(isinstance(name, str) and name in names for name in consumers),
                  "locked source consumer must name a catalog package")
        t.require(len(consumers) == len(set(consumers)), "locked source consumers must be distinct")
        files = source["files"]
        t.require(isinstance(files, list) and 0 < len(files) <= 2048,
                  "locked source files must contain between 1 and 2048 entries")
        hashes = {}
        for file in files:
            file = t.fields(file, {"path", "sha256"}, "locked file")
            t.relative_parts(file["path"])
            t.require(file["path"] not in hashes, "locked file paths must be distinct")
            t.require(isinstance(file["sha256"], str) and bool(t.SHA256.fullmatch(file["sha256"])),
                      "locked file sha256 must be a lowercase SHA-256")
            hashes[file["path"]] = file["sha256"]
        aggregate = "".join(f"{path}\0{digest}\n" for path, digest in sorted(hashes.items())).encode("utf-8")
        t.require(hashlib.sha256(aggregate).hexdigest() == source["package_sha256"],
                  f"locked source package aggregate mismatch: {identifier}")
    return len(sources)


def validate_repository(path: str | Path = REPOSITORY) -> dict[str, int]:
    t = skill_tools
    with RepositoryRoot(path) as root:
        reject_tracked_scratch(root.path)
        inventory = root.inventory(IGNORED_NAMES, REPOSITORY_ALIASES, IGNORED_ROOT_NAMES)
        for relative, info in inventory:
            if stat.S_ISLNK(info.st_mode):
                root.check_alias(relative, REPOSITORY_ALIASES[relative])
        files = {relative for relative, info in inventory if stat.S_ISREG(info.st_mode)}
        data = t.strict_json(root.read_bytes("catalog.json", t.MAX_JSON_BYTES))
        t.require(isinstance(data, dict) and isinstance(data.get("skills"), list), "catalog must contain a skills array")
        t.require(type(data.get("schema_version")) is int and data["schema_version"] == 1,
                  "catalog schema_version must be 1")
        entries = data["skills"]
        t.require(0 < len(entries) <= 256, "catalog must contain between 1 and 256 packages")
        names = set()
        packages = set()
        for entry in entries:
            t.require(isinstance(entry, dict), "catalog entry must be an object")
            name = t.valid_slug(entry.get("name"), "catalog skill name")
            t.require(name not in names, "catalog names must be distinct")
            names.add(name)
            expected = f".agents/skills/{name}"
            t.require(entry.get("path") == expected, "catalog path must be .agents/skills/<name>")
            t.require(entry.get("status") in ("pilot", "stable", "deprecated"), "invalid catalog status")
            t.require(f"{expected}/SKILL.md" in files, f"catalog package is missing: {name}")
            packages.add(expected)
            t.validate_skill(root.path / expected)
            metadata = t.parse_frontmatter(root.read_text(f"{expected}/SKILL.md"))
            t.validate_model_metadata(metadata.get("metadata", {}), required=True)
        actual = {relative for relative, info in inventory if stat.S_ISDIR(info.st_mode)
                  and relative.startswith(".agents/skills/") and relative.count("/") == 2}
        t.require(packages == actual, "catalog and package directories do not agree")
        links = 0
        text_files = 0
        for relative in sorted(files):
            payload = root.read_bytes(relative, t.MAX_ARTIFACT_BYTES)
            try:
                text = payload.decode("utf-8")
            except UnicodeDecodeError:
                continue  # Binary content still needs a deliberate provenance/security review.
            text_files += 1
            check_public_hygiene(relative, text)
            if relative.endswith(".md"):
                t.require(len(payload) <= t.MAX_TEXT_BYTES, f"Markdown exceeds text limit: {relative}")
                links += t.check_markdown(root, relative, text)
        lock_sources = 0
        if "upstreams.lock.json" in files:
            lock_sources = validate_lock(t.strict_json(root.read_bytes("upstreams.lock.json", t.MAX_JSON_BYTES)), names)
        runs = 0
        for relative in sorted(files):
            if relative.endswith("/run.json") and "/examples/" in relative:
                t.validate_run(root.path / relative)
                runs += 1
        return {"packages": len(packages), "text_files": text_files, "local_links": links,
                "locked_sources": lock_sources, "example_runs": runs}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=REPOSITORY, help="repository root (defaults to this checkout)")
    args = parser.parse_args(argv)
    try:
        result = validate_repository(args.root)
    except (OSError, subprocess.TimeoutExpired, skill_tools.ValidationError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    print(skill_tools.json.dumps(result, sort_keys=True))
    print("Structural checks passed; behavioral quality, licensing, and public readiness still require review.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
