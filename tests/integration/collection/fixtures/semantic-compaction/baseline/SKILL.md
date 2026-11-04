# Synthetic report skill
Read policy.json before processing input. Every run reads both this entrypoint and policy.json.
Read CSV with UTF-8. Require id. Export unique IDs. Preview by default; write report.csv only after approval for that exact output. Invalid input must not write. Return offending row number for invalid rows.
Example: id, then rows 7 and 7, previews one ID 7. Only approval for report.csv allows writing report.csv.
A schema failure precedes a row failure. Unresolved source conflicts block execution. Proposed evidence remains proposed and blocks acceptance. Missing bundled-parser blocks execution.
For clarity: every run reads policy.json. Use UTF-8, require id, export unique IDs, preview by default. Approval for another file does not authorize report.csv. Reject invalid input without writing; preserve row diagnostics. Do not treat proposed evidence as confirmed. Do not ignore conflicting sources. Do not skip missing parser dependencies.
