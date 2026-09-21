// VORTEX TaskBot — لایه دیتابیس
// دو بک‌اند کاملاً خودمختار:
//   1) PostgreSQL — وقتی DATABASE_URL ست باشد (دیتابیس کامل روی Render).
//   2) فایل JSON محلی — وقتی DATABASE_URL نباشد (صفر تا صفر روی لوکال: data/db.json).
//
// runtime فقط یک snapshot در حافظه است؛ save() تراکنشی sync می‌کند.

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'data', 'db.json');

let pool = null;
let healthy = false;
let mode = 'file';

// ── state پیش‌فرض ──
const DEFAULT_USERS = [
  { id: 'u1', name: 'من', color: '#6ea8fe', disabled: false, createdAt: 0 },
  { id: 'u2', name: 'رفیق', color: '#44e2cd', disabled: false, createdAt: 0 },
];

function freshState() {
  return {
    users: JSON.parse(JSON.stringify(DEFAULT_USERS)),
    projects: [],
    events: [],
    seq: { users: 2, projects: 0, events: 0 },
  };
}

let db = freshState();
let queue = Promise.resolve();

// ── PostgreSQL ──
async function _pgConnect() {
  if (pool) return pool;
  if (!process.env.DATABASE_URL) return null;
  pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  try {
    await pool.query('SELECT 1');
  } catch (e) {
    console.error('⚠️ PostgreSQL در دسترس نیست، فالبک روی JSON:', e.message);
    pool = null;
    return null;
  }
  return pool;
}

async function _loadFromPg() {
  const p = await _pgConnect();
  if (!p) return null;
  try {
    const [u, pr, ev, meta] = await Promise.all([
      p.query('SELECT id, name, color, disabled, created_at FROM users'),
      p.query('SELECT id, title, description, difficulty, priority, deadline, tags, status, assigned_to, created_at, updated_at FROM projects'),
      p.query('SELECT id, type, project_id, user_id, text, created_at FROM events ORDER BY created_at ASC, id ASC'),
      p.query("SELECT key, value FROM meta WHERE key IN ('seq_users','seq_projects','seq_events')"),
    ]);
    const m = {};
    for (const row of meta.rows) m[row.key] = row.value;
    const state = freshState();
    state.users = u.rows.map((r) => ({
      id: r.id, name: r.name, color: r.color,
      disabled: !!r.disabled, createdAt: Number(r.created_at || 0),
    }));
    state.projects = pr.rows.map((r) => ({
      id: r.id, title: r.title, description: r.description || '',
      difficulty: r.difficulty || 'normal', priority: Number(r.priority || 1),
      deadline: r.deadline || '', tags: r.tags || [],
      status: r.status || 'available', assignedTo: r.assigned_to || null,
      createdAt: Number(r.created_at || 0), updatedAt: Number(r.updated_at || 0),
    }));
    state.events = ev.rows.map((r) => ({
      id: r.id, type: r.type || 'note', projectId: r.project_id || null,
      userId: r.user_id || null, text: r.text || '', createdAt: Number(r.created_at || 0),
    }));
    state.seq.users = Number(m.seq_users) || state.users.length;
    state.seq.projects = Number(m.seq_projects) || state.projects.length;
    state.seq.events = Number(m.seq_events) || state.events.length;
    return state;
  } catch (e) {
    console.error('PG load failed:', e.message);
    return null;
  }
}

async function _saveToPg() {
  if (!healthy) return;
  const p = pool;
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    await client.query('TRUNCATE users, projects, events, meta');
    for (const u of db.users) {
      await client.query(
        'INSERT INTO users (id, name, color, disabled, created_at) VALUES ($1,$2,$3,$4,$5)',
        [u.id, u.name, u.color, !!u.disabled, Number(u.createdAt || 0)]
      );
    }
    for (const pr of db.projects) {
      await client.query(
        `INSERT INTO projects (id, title, description, difficulty, priority, deadline, tags, status, assigned_to, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [pr.id, pr.title, pr.description || '', pr.difficulty || 'normal',
         Number(pr.priority || 1), pr.deadline || '', pr.tags || [], pr.status || 'available',
         pr.assignedTo || null, Number(pr.createdAt || 0), Number(pr.updatedAt || 0)]
      );
    }
    for (const e of db.events) {
      await client.query(
        'INSERT INTO events (id, type, project_id, user_id, text, created_at) VALUES ($1,$2,$3,$4,$5,$6)',
        [e.id, e.type || 'note', e.projectId || null, e.userId || null, e.text || '', Number(e.createdAt || 0)]
      );
    }
    await client.query('INSERT INTO meta (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value', ['seq_users', String(db.seq.users)]);
    await client.query('INSERT INTO meta (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value', ['seq_projects', String(db.seq.projects)]);
    await client.query('INSERT INTO meta (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value', ['seq_events', String(db.seq.events)]);
    await client.query('COMMIT');
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

// ── فایل JSON ──
function _loadFromFile() {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const state = freshState();
    state.users = parsed.users || state.users;
    state.projects = parsed.projects || [];
    state.events = parsed.events || [];
    state.seq = parsed.seq || state.seq;
    return state;
  } catch {
    return null;
  }
}

function _saveToFile() {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
}

// ── عمومی ──
async function init() {
  let loaded = null;
  if (process.env.DATABASE_URL) {
    const p = await _pgConnect();
    if (p) {
      loaded = await _loadFromPg();
      if (loaded) { mode = 'pg'; healthy = true; console.log('[db] PostgreSQL backend'); }
    }
  }
  if (!healthy) {
    mode = 'file';
    loaded = _loadFromFile();
    console.log('[db] JSON-file backend -> ' + DB_FILE);
  }
  if (loaded) {
    db = loaded;
    if (!db.users.length) db.users = freshState().users;
    if (!db.seq) db.seq = { users: db.users.length, projects: db.projects.length, events: db.events.length };
  }
  if (!db.users.length) db.users = freshState().users;
  await _ensureDefaultUsers();
  await save();
  return db;
}

async function _ensureDefaultUsers() {
  const names = new Set(db.users.map((u) => u.id));
  for (const du of DEFAULT_USERS) {
    if (!names.has(du.id)) db.users.push(JSON.parse(JSON.stringify(du)));
  }
  if (db.seq.users < db.users.length) db.seq.users = db.users.length;
}

async function save() {
  queue = queue.then(async () => {
    if (mode === 'pg') { try { await _saveToPg(); } catch (e) { console.error('[db] PG save failed:', e.message); } }
    else _saveToFile();
  });
  return queue;
}

function getState() {
  return db;
}

// هر جهش باید هم‌زمان snapshot را عوض کند و بعد save کند.
async function mutate(fn) {
  const result = fn(db);
  await save();
  return result;
}

function now() {
  return Date.now();
}

function nextId(kind) {
  db.seq[kind] = (db.seq[kind] || 0) + 1;
  return kind + '_' + db.seq[kind];
}

module.exports = { init, save, getState, mutate, now, nextId, freshState, defaults: DEFAULT_USERS };