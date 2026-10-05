CREATE TABLE quality_receipts (
event_id TEXT PRIMARY KEY REFERENCES usage_events(event_id), correlation_id TEXT NOT NULL,
collection TEXT NOT NULL, skill TEXT NOT NULL, source_key TEXT NOT NULL, identity_key TEXT NOT NULL,
source_json TEXT NOT NULL, occurred_at TEXT NOT NULL, recorded_at TEXT NOT NULL,
kind TEXT NOT NULL CHECK(kind IN ('official_validation','behavioral_evaluation')),
assurance TEXT NOT NULL CHECK(assurance IN ('caller_assertion','locally_observed_official_process','verified_retained_benchmark')),
method_name TEXT NOT NULL, result TEXT NOT NULL CHECK(result IN ('pass','fail','blocked','not-run')));
CREATE INDEX quality_period ON quality_receipts(occurred_at,event_id);
CREATE INDEX quality_collection_period ON quality_receipts(collection,occurred_at,event_id);
CREATE INDEX quality_skill_period ON quality_receipts(collection,skill,occurred_at,event_id);
CREATE INDEX quality_source_period ON quality_receipts(collection,source_key,occurred_at,event_id);
CREATE INDEX quality_identity_period ON quality_receipts(collection,identity_key,occurred_at,event_id);
CREATE INDEX quality_kind_period ON quality_receipts(collection,kind,occurred_at,event_id);