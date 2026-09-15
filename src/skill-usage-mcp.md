# Skill usage MCP entrypoint

Run `node src/skill-usage-mcp.mjs --db /absolute/local-data/skill-usage.db` with Node.js 24+. The existing canonical parent directory must be caller-owned and trusted. The process uses stdin/stdout for MCP JSON-RPC; stdout contains protocol messages only. Startup applies usage-schema migrations; explicit record calls persist read events. No filesystem reads are automatically observed.

See [the usage contract](../docs/skill-usage-mcp.md) for event fields, retry behavior, ranking queries and the dedicated-database limitation. Stop the client process to close the SQLite connection. Removal does not delete the database. Verify with `node --test tests/skill-usage-mcp.test.mjs`.
