-- People with their own login who can open someone else's trip (edit or view)
CREATE TABLE trip_members (
  trip_id TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('edit', 'view')),
  added_at INTEGER NOT NULL,
  PRIMARY KEY (trip_id, email)
);
CREATE INDEX trip_members_email ON trip_members(email);

-- One-time sign-in links the owner hands a new member (works without email delivery)
CREATE TABLE invites (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  trip_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
