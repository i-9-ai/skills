# Issued schema fixture

`quality-v4.sql` contains the exact issued version-4 quality SQL from this repository's `SkillReadMigration` at source revision `0994488e95ddd7ecceadd7d461e5cac0c5877979`. Its SHA-256 is `0a32f907ceb2cd1ac5214a9d8e72723274a7575cd7c3c9a622caf9c36c3e33b3`. It is Apache-2.0 repository code, retained as a test-only fixture to exercise the supported v3-to-v4 transition without importing a private acquisition path or replacing the current production migration.

The baseline migration class retains the issued v3 SQL and checksums and only creates new disposable fixture history. This SQL file is neither production migration entrypoint nor native execution evidence and need not ship in npm.
