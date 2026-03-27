-- AgroSentinel v2 correction migration
-- Adds transparent reasoning + heavy metal strategy storage fields.

ALTER TABLE IF EXISTS scan_logs
  ADD COLUMN IF NOT EXISTS reasoning_chain JSONB,
  ADD COLUMN IF NOT EXISTS evidence_summary JSONB,
  ADD COLUMN IF NOT EXISTS contradictions_resolved JSONB;

ALTER TABLE IF EXISTS heavy_metal_reports
  ADD COLUMN IF NOT EXISTS heavy_metal_strategy JSONB,
  ADD COLUMN IF NOT EXISTS evidence_chain JSONB;

ALTER TABLE IF EXISTS farm_risk_scores
  ADD COLUMN IF NOT EXISTS recommended_crops TEXT[],
  ADD COLUMN IF NOT EXISTS avoid_crops TEXT[],
  ADD COLUMN IF NOT EXISTS remediation_status TEXT,
  ADD COLUMN IF NOT EXISTS last_assessment_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_assessment_due TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_scan_id UUID;

CREATE INDEX IF NOT EXISTS idx_scan_logs_reasoning_gin
  ON scan_logs USING GIN (reasoning_chain);

CREATE INDEX IF NOT EXISTS idx_scan_logs_evidence_summary_gin
  ON scan_logs USING GIN (evidence_summary);

CREATE INDEX IF NOT EXISTS idx_scan_logs_contradictions_gin
  ON scan_logs USING GIN (contradictions_resolved);

CREATE INDEX IF NOT EXISTS idx_heavy_metal_reports_strategy_gin
  ON heavy_metal_reports USING GIN (heavy_metal_strategy);

CREATE INDEX IF NOT EXISTS idx_heavy_metal_reports_evidence_gin
  ON heavy_metal_reports USING GIN (evidence_chain);
