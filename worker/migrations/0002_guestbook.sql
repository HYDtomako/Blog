CREATE TABLE IF NOT EXISTS guestbook_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id INTEGER,
  body TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS guestbook_likes (
  message_id INTEGER NOT NULL,
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (message_id, actor_id)
);
CREATE INDEX IF NOT EXISTS idx_guestbook_messages_thread ON guestbook_messages (parent_id, id);
CREATE INDEX IF NOT EXISTS idx_guestbook_messages_actor ON guestbook_messages (actor_id, created_at);
CREATE INDEX IF NOT EXISTS idx_guestbook_likes_actor ON guestbook_likes (actor_id);
