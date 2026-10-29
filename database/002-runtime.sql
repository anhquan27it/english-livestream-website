BEGIN;
-- These files are intentionally retained after a class is deleted (admin archive).
ALTER TABLE englive.pdfs DROP CONSTRAINT IF EXISTS pdfs_class_id_fkey;
ALTER TABLE englive.recordings DROP CONSTRAINT IF EXISTS recordings_class_id_fkey;
CREATE TABLE IF NOT EXISTS englive.runtime_entries (
  category text NOT NULL, entry_key text NOT NULL,
  document jsonb NOT NULL, position integer NOT NULL DEFAULT 0,
  PRIMARY KEY(category,entry_key)
);
CREATE TABLE IF NOT EXISTS englive.storage_meta (
  key text PRIMARY KEY, value jsonb NOT NULL
);
ALTER TABLE englive.users ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;
ALTER TABLE englive.classes ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;
ALTER TABLE englive.lessons ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;
ALTER TABLE englive.schedules ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;
ALTER TABLE englive.assignments ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;
ALTER TABLE englive.submissions ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;
ALTER TABLE englive.vocabulary ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;
ALTER TABLE englive.chats ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;
ALTER TABLE englive.recordings ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;
ALTER TABLE englive.pdfs ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;
ALTER TABLE englive.listening ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;
ALTER TABLE englive.activity_results ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;
ALTER TABLE englive.audit ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;
INSERT INTO englive.schema_migrations(version) VALUES(2) ON CONFLICT DO NOTHING;
COMMIT;
