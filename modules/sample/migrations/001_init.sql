-- Sample module's own table. Must be namespaced mod_<id>_* (mod_sample_*).
CREATE TABLE IF NOT EXISTS mod_sample_notes (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  text      TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
