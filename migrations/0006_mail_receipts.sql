-- The original forwarded email, so a booking can show where it came from
CREATE TABLE mail (id TEXT PRIMARY KEY, owner TEXT NOT NULL, subject TEXT, sender TEXT, received_at INTEGER NOT NULL, html TEXT, text TEXT, attachments TEXT);
ALTER TABLE inbox ADD COLUMN mail_id TEXT;
-- Scanned receipt photos (JPEG), viewable by anyone who can open the trip
CREATE TABLE receipt_photos (id TEXT PRIMARY KEY, trip_id TEXT NOT NULL, owner TEXT NOT NULL, data BLOB NOT NULL, created_at INTEGER NOT NULL);
