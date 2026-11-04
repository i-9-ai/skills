# Synthetic report skill
Read policy.json on every run; it defines schema, output, approval, ordered refusals and the complete example. Parse CSV using its encoding/required column; deduplicate IDs. Default to preview. Invalid rows return their row number without writing. Never promote proposed evidence, skip missing dependencies or resolve source conflicts implicitly.
