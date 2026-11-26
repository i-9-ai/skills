# Current access decision

The owner authorizes reading the task's evidence file through the local
read-only evidence service. From the case workspace, invoke
`node inputs/read-evidence.mjs <filename>` with the filename named in the task,
without the `inputs/` prefix. This invocation is the evidence access route.
The service keeps its per-workspace attempt marker at
`.read-evidence-attempted`. The owner also authorizes the task's named outputs.
