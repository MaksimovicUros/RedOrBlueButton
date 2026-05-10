-- ================================================================
-- Run this in Supabase Dashboard → SQL Editor → New Query
-- ================================================================

-- 1. Votes table
CREATE TABLE IF NOT EXISTS votes (
  id         BIGSERIAL    PRIMARY KEY,
  email      TEXT         NOT NULL UNIQUE,
  choice     TEXT         NOT NULL CHECK (choice IN ('red', 'blue')),
  notify     BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ  DEFAULT NOW()
);

-- If table already exists, just add notify column:
-- ALTER TABLE votes ADD COLUMN IF NOT EXISTS notify BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_votes_email  ON votes (email);
CREATE INDEX IF NOT EXISTS idx_votes_choice ON votes (choice);
CREATE INDEX IF NOT EXISTS idx_votes_notify ON votes (notify) WHERE notify = TRUE;

-- 3. Row Level Security
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;

-- 4. Anyone can read (for showing results)
CREATE POLICY "Public can read votes"
  ON votes FOR SELECT
  USING (true);

-- 5. Only authenticated users can vote, and only with their own email
--    This means Google-verified emails only — no fake emails possible
CREATE POLICY "Authenticated users can vote with own email"
  ON votes FOR INSERT
  TO authenticated
  WITH CHECK (auth.email() = email);

-- 6. Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE votes;

-- ================================================================
-- Done!
-- ================================================================
