-- Set once a row's content has moved to the ARCHIVE R2 bucket (see worker/archive.ts)
ALTER TABLE mail ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
ALTER TABLE receipt_photos ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
