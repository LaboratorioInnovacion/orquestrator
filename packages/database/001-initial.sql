CREATE TABLE IF NOT EXISTS projects (
 id text PRIMARY KEY, name text NOT NULL, objective text NOT NULL,
 paused boolean NOT NULL DEFAULT true,
 token_limit bigint NOT NULL CHECK (token_limit > 0),
 reserved bigint NOT NULL DEFAULT 0 CHECK (reserved >= 0),
 consumed bigint NOT NULL DEFAULT 0 CHECK (consumed >= 0),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS requests (
 id text PRIMARY KEY, source text NOT NULL, external_id text NOT NULL,
 body_hash text NOT NULL, project_id text NOT NULL REFERENCES projects(id),
 UNIQUE(source, external_id)
);
CREATE TABLE IF NOT EXISTS plans (
 id text PRIMARY KEY, project_id text NOT NULL REFERENCES projects(id),
 revision integer NOT NULL, definition jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(project_id, revision)
);
CREATE TABLE IF NOT EXISTS tasks (
 id text PRIMARY KEY, project_id text NOT NULL REFERENCES projects(id),
 plan_id text NOT NULL REFERENCES plans(id), key text NOT NULL, role text NOT NULL,
 instructions text NOT NULL, criteria jsonb NOT NULL, depends_on jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending', version integer NOT NULL DEFAULT 1,
 workspace text NOT NULL, review jsonb, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(plan_id, key)
);
CREATE INDEX IF NOT EXISTS tasks_status ON tasks(status, created_at);
CREATE TABLE IF NOT EXISTS attempts (
 id text PRIMARY KEY, task_id text NOT NULL REFERENCES tasks(id), number integer NOT NULL,
 status text NOT NULL, model text NOT NULL, lease_until timestamptz NOT NULL,
 reservation integer NOT NULL, usage integer, usage_estimated boolean NOT NULL DEFAULT false,
 checkpoint jsonb NOT NULL DEFAULT '[]', error text,
 created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
 UNIQUE(task_id, number)
);
CREATE TABLE IF NOT EXISTS events (
 sequence bigserial PRIMARY KEY, id text NOT NULL UNIQUE,
 project_id text REFERENCES projects(id), task_id text REFERENCES tasks(id),
 type text NOT NULL, payload jsonb NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_project ON events(project_id, sequence);
CREATE TABLE IF NOT EXISTS artifacts (
 id text PRIMARY KEY, project_id text NOT NULL REFERENCES projects(id),
 task_id text NOT NULL REFERENCES tasks(id), attempt_id text NOT NULL REFERENCES attempts(id),
 name text NOT NULL, mime text NOT NULL, content text NOT NULL, checksum text NOT NULL,
 size integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(attempt_id, name)
);
CREATE TABLE IF NOT EXISTS memories (
 id text PRIMARY KEY, project_id text NOT NULL REFERENCES projects(id), key text NOT NULL,
 content text NOT NULL, source text NOT NULL, author text NOT NULL,
 revision integer NOT NULL, expires_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(project_id,key,revision)
);
CREATE TABLE IF NOT EXISTS approvals (
 id text PRIMARY KEY, task_id text NOT NULL REFERENCES tasks(id), attempt_id text NOT NULL REFERENCES attempts(id),
 action jsonb NOT NULL, action_hash text NOT NULL, status text NOT NULL DEFAULT 'pending',
 version integer NOT NULL DEFAULT 1, expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS messages (
 id text PRIMARY KEY, project_id text NOT NULL REFERENCES projects(id), task_id text REFERENCES tasks(id),
 sender text NOT NULL, recipient text NOT NULL, type text NOT NULL,
 content text NOT NULL, correlation_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS automations (
 id text PRIMARY KEY, project_id text NOT NULL REFERENCES projects(id),
 name text NOT NULL, timezone text NOT NULL, interval_seconds integer NOT NULL CHECK(interval_seconds >= 60),
 next_at timestamptz NOT NULL, paused boolean NOT NULL DEFAULT true,
 plan jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS occurrences (
 automation_id text NOT NULL REFERENCES automations(id), scheduled_at timestamptz NOT NULL,
 status text NOT NULL, PRIMARY KEY(automation_id,scheduled_at)
);
CREATE TABLE IF NOT EXISTS audit (
 id text PRIMARY KEY, actor text NOT NULL, operation text NOT NULL,
 project_id text REFERENCES projects(id), payload jsonb NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now()
);
