---
'@i-9.ai/skills': minor
---

Add `--executable`, `--project`, `--global-root`, `--no-global` and `--max-entries`
to `hook session-config` and `hook verify`. Generate opt-in POSIX session hooks
for a retained local CLI executable and resolve its consumer project explicitly
or from the hook working directory. Reject missing or non-executable selections;
preserve existing checkout and plugin defaults. Generation and verification do
not enable hooks, install dependencies or prove native host delivery.
