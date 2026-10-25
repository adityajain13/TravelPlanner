-- Bookings extracted from emails forwarded to trips@adityajain.ca, awaiting review in the app
CREATE TABLE inbox (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  trip_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'added', 'dismissed')),
  subject TEXT,
  booking TEXT NOT NULL, -- JSON, see worker/email.ts Booking
  created_at INTEGER NOT NULL
);
CREATE INDEX inbox_owner_status ON inbox(owner, status);
