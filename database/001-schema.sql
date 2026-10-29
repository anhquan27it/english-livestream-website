BEGIN;
CREATE SCHEMA IF NOT EXISTS englive;
CREATE TABLE IF NOT EXISTS englive.schema_migrations (
  version integer PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS englive.users (
  id text PRIMARY KEY,
  document jsonb NOT NULL CHECK (jsonb_typeof(document) = 'object'),
  name text GENERATED ALWAYS AS (document->>'name') STORED,
  email text GENERATED ALWAYS AS (lower(document->>'email')) STORED UNIQUE NOT NULL,
  role text GENERATED ALWAYS AS (document->>'role') STORED NOT NULL,
  CHECK (role IN ('admin','teacher','assistant','student'))
);
CREATE TABLE IF NOT EXISTS englive.classes (
  id text PRIMARY KEY,
  document jsonb NOT NULL CHECK (jsonb_typeof(document) = 'object'),
  name text GENERATED ALWAYS AS (document->>'name') STORED,
  teacher_id text GENERATED ALWAYS AS (document->>'teacherId') STORED NOT NULL
    REFERENCES englive.users(id) DEFERRABLE INITIALLY DEFERRED,
  code text GENERATED ALWAYS AS (document->>'code') STORED UNIQUE NOT NULL
);
CREATE TABLE IF NOT EXISTS englive.class_memberships (
  class_id text NOT NULL REFERENCES englive.classes(id) DEFERRABLE INITIALLY DEFERRED,
  user_id text NOT NULL REFERENCES englive.users(id) DEFERRABLE INITIALLY DEFERRED,
  status text NOT NULL CHECK (status IN ('member','pending','assistant')),
  PRIMARY KEY(class_id,user_id,status)
);
CREATE TABLE IF NOT EXISTS englive.class_sessions (
  id text PRIMARY KEY,
  class_id text NOT NULL REFERENCES englive.classes(id) DEFERRABLE INITIALLY DEFERRED,
  position integer NOT NULL,
  document jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS englive.lessons (
  id text PRIMARY KEY, document jsonb NOT NULL,
  teacher_id text GENERATED ALWAYS AS (document->>'teacherId') STORED
    REFERENCES englive.users(id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE IF NOT EXISTS englive.schedules (
  id text PRIMARY KEY, document jsonb NOT NULL,
  class_id text GENERATED ALWAYS AS (document->>'classId') STORED NOT NULL
    REFERENCES englive.classes(id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE IF NOT EXISTS englive.assignments (
  id text PRIMARY KEY, document jsonb NOT NULL,
  class_id text GENERATED ALWAYS AS (document->>'classId') STORED NOT NULL
    REFERENCES englive.classes(id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE IF NOT EXISTS englive.submissions (
  id text PRIMARY KEY, document jsonb NOT NULL,
  assignment_id text GENERATED ALWAYS AS (document->>'assignmentId') STORED NOT NULL
    REFERENCES englive.assignments(id) DEFERRABLE INITIALLY DEFERRED,
  user_id text GENERATED ALWAYS AS (document->>'userId') STORED NOT NULL
    REFERENCES englive.users(id) DEFERRABLE INITIALLY DEFERRED,
  UNIQUE(assignment_id,user_id)
);
CREATE TABLE IF NOT EXISTS englive.vocabulary (
  id text PRIMARY KEY, document jsonb NOT NULL,
  user_id text GENERATED ALWAYS AS (document->>'userId') STORED NOT NULL
    REFERENCES englive.users(id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE IF NOT EXISTS englive.chats (
  id text PRIMARY KEY, document jsonb NOT NULL,
  user_id text GENERATED ALWAYS AS (document->>'userId') STORED NOT NULL
    REFERENCES englive.users(id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE IF NOT EXISTS englive.recordings (
  id text PRIMARY KEY, document jsonb NOT NULL,
  class_id text GENERATED ALWAYS AS (document->>'classId') STORED NOT NULL
    REFERENCES englive.classes(id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE IF NOT EXISTS englive.pdfs (
  id text PRIMARY KEY, document jsonb NOT NULL,
  class_id text GENERATED ALWAYS AS (document->>'classId') STORED NOT NULL
    REFERENCES englive.classes(id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE IF NOT EXISTS englive.listening (
  id text PRIMARY KEY, document jsonb NOT NULL,
  class_id text GENERATED ALWAYS AS (document->>'classId') STORED NOT NULL
    REFERENCES englive.classes(id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE IF NOT EXISTS englive.activity_results (
  id text PRIMARY KEY, document jsonb NOT NULL,
  class_id text GENERATED ALWAYS AS (document->>'classId') STORED NOT NULL
    REFERENCES englive.classes(id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE IF NOT EXISTS englive.audit (id text PRIMARY KEY, document jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS englive.settings (key text PRIMARY KEY, value jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS englive.imports (
  id text PRIMARY KEY, source_sha256 text NOT NULL,
  counts jsonb NOT NULL, imported_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS classes_teacher_idx ON englive.classes(teacher_id);
CREATE INDEX IF NOT EXISTS memberships_user_idx ON englive.class_memberships(user_id);
CREATE INDEX IF NOT EXISTS sessions_class_idx ON englive.class_sessions(class_id,position);
CREATE INDEX IF NOT EXISTS schedules_class_idx ON englive.schedules(class_id);
CREATE INDEX IF NOT EXISTS assignments_class_idx ON englive.assignments(class_id);
CREATE INDEX IF NOT EXISTS submissions_user_idx ON englive.submissions(user_id);
CREATE INDEX IF NOT EXISTS vocabulary_user_idx ON englive.vocabulary(user_id);
CREATE INDEX IF NOT EXISTS chats_user_idx ON englive.chats(user_id);
INSERT INTO englive.schema_migrations(version) VALUES(1) ON CONFLICT DO NOTHING;
COMMIT;
