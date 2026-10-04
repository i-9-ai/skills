# Synthetic source-history policy

SPDX-License-Identifier: Apache-2.0

The source fixture has no prior Git repository. The fictional source owner
authorizes recording this exact supplied tree as its initial local revision.
Initialize Git only inside `collections/source/`; use a synthetic local identity
through command-local or repository-local settings, never a user's global Git
configuration. Stage only the supplied source catalog and package files.

Retain that source repository and its reachable baseline commit. Confirm the
commit contains the source package, its complete license and reference, and
record the actual commit identifier and successful retrieval check. An invented
SHA, an empty repository or a table of old/new paths is not retained history.

Do not add remotes, contact a server, import external history, rewrite history
or remove the source package. A separate Git bundle is unnecessary when this
authorized source repository and baseline remain retrievable. Describe rollback
of target additions while leaving source history and existing target files intact.

If Git is unavailable, preserve the original source and any staged candidate;
report the history gate blocked instead of claiming migration acceptance.
