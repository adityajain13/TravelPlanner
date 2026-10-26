-- NAVITIME (Japan transit) answers, kept for a year and shared by every device and user:
-- the free plan only has a few hundred searches a month, and train times barely change
CREATE TABLE transit_cache (
  key TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
