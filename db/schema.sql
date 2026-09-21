-- VORTEX TaskBot — PostgreSQL schema (اسکیمای مجزا taskbot)
-- همه‌چیز داخل اسکیمای مجزای taskbot هست تا با دیتای بقیه اپ‌ها تداخل نداشته باشه.
-- ساخت‌سازی خودکار هنگام بالا آمدن، idempotent است.

CREATE SCHEMA IF NOT EXISTS taskbot;

CREATE TABLE IF NOT EXISTS taskbot.users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#6ea8fe',
  disabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS taskbot.projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  difficulty TEXT NOT NULL DEFAULT 'normal',
  priority INT NOT NULL DEFAULT 1,
  deadline TEXT NOT NULL DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'available',
  assigned_to TEXT,
  created_at BIGINT NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS taskbot.events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'note',
  project_id TEXT,
  user_id TEXT,
  text TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS taskbot.meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);