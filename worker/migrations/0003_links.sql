CREATE TABLE IF NOT EXISTS link_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  domain TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  depth INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_link_submissions_actor_url ON link_submissions (actor_id, url);
CREATE INDEX IF NOT EXISTS idx_link_submissions_created ON link_submissions (created_at DESC);
