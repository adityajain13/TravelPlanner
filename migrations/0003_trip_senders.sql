-- People (besides the owner) allowed to forward booking emails to one trip's address, trips+<id>@
CREATE TABLE trip_senders (
  trip_id TEXT NOT NULL,
  email TEXT NOT NULL,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (trip_id, email)
);
