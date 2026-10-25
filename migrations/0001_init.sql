-- Email-code login
CREATE TABLE login_codes (
  email TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  link_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);

-- 1-year sessions (only a SHA-256 of the cookie token is stored)
CREATE TABLE sessions (
  id_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  user_agent TEXT
);
CREATE INDEX sessions_email ON sessions(email);

-- Server-side trip index. Contents live in the trip's Durable Object.
-- share_version is baked into share links; bumping it revokes every link for the trip.
CREATE TABLE trips (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  title TEXT,
  destination TEXT,
  start_date TEXT,
  end_date TEXT,
  share_version INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);
CREATE INDEX trips_owner ON trips(owner);
