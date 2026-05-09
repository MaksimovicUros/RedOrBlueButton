-- ================================================================
-- Run this in Supabase Dashboard → SQL Editor → New Query
-- ================================================================

-- 1. Create the votes table
CREATE TABLE IF NOT EXISTS votes (
  id         BIGSERIAL    PRIMARY KEY,
  email      TEXT         NOT NULL UNIQUE,
  choice     TEXT         NOT NULL CHECK (choice IN ('red', 'blue')),
  created_at TIMESTAMPTZ  DEFAULT NOW()
);

-- 2. Index for fast email lookups (duplicate check)
CREATE INDEX IF NOT EXISTS idx_votes_email  ON votes (email);
CREATE INDEX IF NOT EXISTS idx_votes_choice ON votes (choice);

-- 3. Enable Row Level Security (locks down the table)
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;

-- 4. Allow anyone to READ votes (needed to show results)
CREATE POLICY "Public can read votes"
  ON votes FOR SELECT
  USING (true);

-- 5. Allow anyone to INSERT a vote (uniqueness enforced by DB constraint)
CREATE POLICY "Public can insert votes"
  ON votes FOR INSERT
  WITH CHECK (true);

-- UPDATE and DELETE have no policies = blocked for everyone by default ✓

-- 6. Enable Realtime for instant result updates
ALTER PUBLICATION supabase_realtime ADD TABLE votes;

-- ================================================================
-- Done! Your database is ready.
-- ================================================================
