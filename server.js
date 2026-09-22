// VORTEX TaskBot — سرور Express + API
// تقسیم رندوم پروژه‌ها بین دو نفر، با رباتی که اگر کسی «نمی‌تونم» گفت
// پروژه رو به انبار برمی‌گردونه و یه پروژه دیگه بهش می‌ده.

const express = require('express');
const path = require('path');
const db = require('./db');
const engine = require('./lib/engine');
const ai = require('./lib/ai');

const app = express();
app.use(express.json({ limit: '1mb' }));

if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);

// ───────────────────────────────────────────────────────────── helpers ──────
const U = (u) => (u ? u.name : '؟');
const T = (p) => (p ? p.title : 'پروژه');
const AI_DIFF = { easy: 'ساده', normal: 'متوسط', hard: 'سخت' };
const AI_PRI = { 0: 'کم', 1: 'متوسط', 2: 'بالا' };

function userById(state, id) {
  return state.users.find((u) => u.id === id) || null;
}
function projectById(state, id) {
  return state.projects.find((p) => p.id === id) || null;
}
function activeUsers(state) {
  return state.users.filter((u) => !u.disabled);
}
function poolCount(state) {
  return state.projects.filter((p) => p.status === 'available').length;
}
function assignedCount(state, userId) {
  return state.projects.filter((p) => p.assignedTo === userId && p.status !== 'done').length;
}

// رویداد جدید (پیام ربات / لاگ فعالیت)
function pushEvent(state, type, project, user, extra) {
  const e = {
    id: db.nextId('events'),
    type,
    projectId: project ? project.id : null,
    userId: user ? user.id : null,
    text: extra && extra.text ? extra.text : '',
    createdAt: db.now(),
  };
  state.events.push(e);
  return e;
}

function note(state, title, project, user) {
  return pushEvent(state, 'note', project, user, { text: title });
}

// ── Public (فرانت‌اند VORTEX) ──
app.use(express.static(path.join(__dirname, 'public')));

// ── State ──
app.get(['/', '/index.html'], (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.get('/api/state', (req, res) => {
  const state = db.getState();
  res.json(buildState(state));
});

function buildState(state) {
  const stats = {};
  for (const u of state.users) {
    const mine = state.projects.filter((p) => p.assignedTo === u.id);
    stats[u.id] = {
      total: mine.length,
      active: mine.filter((p) => p.status !== 'done').length,
      inProgress: mine.filter((p) => p.status === 'in_progress').length,
      done: mine.filter((p) => p.status === 'done').length,
      rejected: state.events.filter((e) => e.type === 'cant' && e.userId === u.id).length,
    };
  }
  return {
    users: state.users,
    projects: state.projects,
    events: state.events,
    stats,
    pool: poolCount(state),
    serverTime: Date.now(),
  };
}

// ── کاربران (نام‌ها) ──
app.post('/api/users/:id', async (req, res) => {
  const { name, color, disabled } = req.body || {};
  const id = req.params.id;
  try {
    await db.mutate((state) => {
      const u = userById(state, id);
      if (!u) return { error: 'کاربر پیدا نشد' };
      if (typeof name === 'string' && name.trim()) u.name = name.trim().slice(0, 25);
      if (typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color)) u.color = color;
      if (typeof disabled === 'boolean') u.disabled = disabled;
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── پروژه‌ها ──
app.post('/api/projects', async (req, res) => {
  const b = req.body || {};
  const title = (b.title || '').trim();
  const description = (b.description || '').trim();
  if (!title) return res.status(400).json({ error: 'عنوان پروژه الزامی است' });
  try {
    // اگر سختی دستی انتخاب نشده باشد → تحلیل خودکار AI
    const isManual = ['easy', 'normal', 'hard'].includes(b.difficulty);
    let aiResult = null;
    if (!isManual) {
      aiResult = await ai.classify(title, description);
      if (!aiResult) aiResult = ai.heuristic(title, description);
    }
    const manualTags = Array.isArray(b.tags) ? b.tags.filter((t) => typeof t === 'string').map((t) => t.trim().slice(0, 30)).filter(Boolean).slice(0, 10) : [];
    const project = await db.mutate((state) => {
      const p = {
        id: db.nextId('projects'),
        title: title.slice(0, 80),
        description: description.slice(0, 2000),
        difficulty: isManual ? b.difficulty : (aiResult ? aiResult.difficulty : 'normal'),
        priority: isManual ? Math.max(0, Math.min(2, parseInt(b.priority, 10) || 1)) : (aiResult ? aiResult.priority : 1),
        deadline: (b.deadline || '').trim().slice(0, 40),
        tags: manualTags.length ? manualTags : (aiResult && aiResult.tags.length ? aiResult.tags : []),
        status: 'available',
        assignedTo: null,
        createdAt: db.now(),
        updatedAt: db.now(),
        aiTag: aiResult ? aiResult.provider : null,
      };
      state.projects.push(p);
      if (aiResult) pushEvent(state, 'add', p, null, { text: '🤖 ' + AI_DIFF[p.difficulty] + ' · اولویت ' + AI_PRI[p.priority] + ' (' + aiResult.provider + ')' });
      else pushEvent(state, 'add', p, null);
      return p;
    });
    res.json({ ok: true, project });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/ai/status', (req, res) => {
  res.json({ enabled: ai.configured().length > 0, providers: ai.configured(), heuristic: true });
});

app.put('/api/projects/:id', async (req, res) => {
  const b = req.body || {};
  try {
    const project = await db.mutate((state) => {
      const p = projectById(state, req.params.id);
      if (!p) return { error: 'پروژه پیدا نشد' };
      if (typeof b.title === 'string' && b.title.trim()) p.title = b.title.trim().slice(0, 80);
      if (typeof b.description === 'string') p.description = b.description.trim().slice(0, 2000);
      if (['easy', 'normal', 'hard'].includes(b.difficulty)) p.difficulty = b.difficulty;
      if (b.priority !== undefined && !isNaN(b.priority)) p.priority = Math.max(0, Math.min(2, parseInt(b.priority, 10)));
      if (typeof b.deadline === 'string') p.deadline = b.deadline.trim().slice(0, 40);
      if (Array.isArray(b.tags)) p.tags = b.tags.filter((t) => typeof t === 'string').map((t) => t.trim().slice(0, 30)).filter(Boolean).slice(0, 10);
      p.updatedAt = db.now();
      pushEvent(state, 'edit', p, null);
      return p;
    });
    res.json({ ok: true, project });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/projects/:id', async (req, res) => {
  try {
    await db.mutate((state) => {
      const idx = state.projects.findIndex((p) => p.id === req.params.id);
      if (idx === -1) return { error: 'پروژه پیدا نشد' };
      const [p] = state.projects.splice(idx, 1);
      pushEvent(state, 'delete', p, null);
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── تقسیم رندوم ──
// body: { userId?, projectId? } — هرکدوم نباشه رندوم انتخاب میشه.
app.post('/api/assign', async (req, res) => {
  const b = req.body || {};
  try {
    const result = await db.mutate((state) => {
      const users = activeUsers(state);
      if (!users.length) return { error: 'کاربری معلوم نشده' };

      let user = userById(state, b.userId) || null;
      if (user && user.disabled) return { error: 'این کاربر فعلاً غیرفعال است' };
      if (!user) user = engine.chooseUser(users, projectCounts(state));

      let project = projectById(state, b.projectId) || null;
      if (project && project.status !== 'available') return { error: 'این پروژه چاپ شده / قابل تخصیص نیست' };
      if (!project) {
        const pool = state.projects.filter((p) => p.status === 'available');
        project = engine.pick(pool);
      }
      if (!project) return { error: 'انبار پروژه خالی است' };

      project.status = 'assigned';
      project.assignedTo = user.id;
      project.updatedAt = db.now();
      const e = pushEvent(state, 'assign', project, user, {
        text: '🎲 «' + project.title + '» به ' + U(user) + ' سپرده شد.',
      });
      return { event: e, project, user };
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// تقسیم همه‌ی انبار به‌صورت عادلانه و رندوم
app.post('/api/assign-all', async (req, res) => {
  try {
    const result = await db.mutate((state) => {
      const users = activeUsers(state);
      if (users.length < 2) return { error: 'حداقل به دو کاربر فعال نیاز داریم' };
      const pool = state.projects.filter((p) => p.status === 'available');
      if (!pool.length) return { error: 'انبار پروژه خالی است' };
      const userIds = users.map((u) => u.id);
      const deck = engine.distribute(pool.map((p) => p.id), userIds);
      const events = [];
      // نسبت پروژه به کاربر از روی توزیع deck
      const assignedByPid = {};
      for (const uid of userIds) {
        for (const pid of deck[uid]) assignedByPid[pid] = uid;
      }
      for (const p of pool) {
        const uid = assignedByPid[p.id];
        if (!uid) continue;
        p.status = 'assigned';
        p.assignedTo = uid;
        p.updatedAt = db.now();
      }
      for (const uid of userIds) {
        const user = userById(state, uid);
        const mine = pool.filter((p) => p.assignedTo === uid);
        for (const p of mine) {
          events.push(pushEvent(state, 'assign', p, user, {
            text: '🎲 «' + p.title + '» به ' + U(user) + ' سپرده شد.',
          }));
        }
      }
      return { events, assigned: events.length };
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function projectCounts(state) {
  const c = {};
  for (const u of state.users) c[u.id] = assignedCount(state, u.id);
  return c;
}

// ── اکشن‌های پروژه ──
app.post('/api/projects/:id/action', async (req, res) => {
  const { action } = req.body || {};
  try {
    const result = await db.mutate((state) => {
      const p = projectById(state, req.params.id);
      if (!p) return { error: 'پروژه پیدا نشد' };
      const user = userById(state, p.assignedTo);
      if (action === 'start') {
        if (p.status !== 'assigned') return { error: 'ابتدا باید به کسی سپرده شود' };
        p.status = 'in_progress';
        p.updatedAt = db.now();
        pushEvent(state, 'start', p, user, { text: '▶️ «' + p.title + '» توسط ' + U(user) + ' شروع شد.' });
      } else if (action === 'done') {
        if (!['assigned', 'in_progress'].includes(p.status)) return { error: 'پروژه قابل انجام نیست' };
        p.status = 'done';
        p.updatedAt = db.now();
        pushEvent(state, 'done', p, user, { text: '✅ «' + p.title + '» توسط ' + U(user) + ' تکمیل شد.' });
      } else {
        return { error: 'اکشن نامعتبر' };
      }
      return { project: p };
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// «نمیتونم»: پروژه برمی‌گرده انبار و پروژه‌ی تصادفی دیگه‌ای به همون نفر داده میشه.
app.post('/api/projects/:id/cant', async (req, res) => {
  try {
    const result = await db.mutate((state) => {
      const p = projectById(state, req.params.id);
      if (!p) return { error: 'پروژه پیدا نشد' };
      if (p.status === 'done') return { error: 'پروژه تموم شده، نمیشه برگردوند' };
      const user = userById(state, p.assignedTo);
      if (!user) return { error: 'پروژه به کسی سپرده نشده' };

      // ۱) برگرداندن به انبار
      p.status = 'available';
      p.assignedTo = null;
      p.updatedAt = db.now();
      const cantEvent = pushEvent(state, 'cant', p, user, {
        text: '↩️ ' + U(user) + ' گفت نمیتونم «' + p.title + '» رو انجام بدم. برگشت به انبار.',
      });

      // ۲) پروژه تصادفی دیگه به همون نفر
      const pool = state.projects.filter((x) => x.status === 'available');
      let reassigned = null;
      if (pool.length) {
        const np = engine.pick(pool);
        np.status = 'assigned';
        np.assignedTo = user.id;
        np.updatedAt = db.now();
        reassigned = pushEvent(state, 'assign', np, user, {
          text: '🎲 به جاش «' + np.title + '» به ' + U(user) + ' سپرده شد.',
        });
      } else {
        note(state, '📭 انبار خالی شد. پروژه‌های جدید بسازید.', null, user);
      }
      return { cantEvent, reassigned, project: p };
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── تنظیمات / ریست ──
app.post('/api/reset', async (req, res) => {
  const { mode } = req.body || {};
  try {
    const result = await db.mutate((state) => {
      if (mode === 'assignments') {
        state.projects.forEach((p) => {
          if (p.status !== 'done') {
            p.status = 'available';
            p.assignedTo = null;
            p.updatedAt = db.now();
          }
        });
        note(state, '🧹 تخصیص‌ها ریست شد. پروژه‌ها به انبار برگشتن.', null, null);
      } else if (mode === 'all') {
        const freshUsers = db.defaults.map((u) => ({ ...u }));
        state.users = freshUsers;
        state.projects = [];
        state.events = [];
        note(state, '🧹 همه‌چیز ریست شد.', null, null);
      } else {
        return { error: 'mode باید assignments یا all باشد' };
      }
      return { ok: true };
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 404 API ──
app.use('/api', (req, res) => res.status(404).json({ error: 'مسیر پیدا نشد' }));

// ── خطاهای عمومی ──
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'خطای سرور' });
});

const PORT = process.env.PORT || 3000;
db.init()
  .then(() => {
    app.listen(PORT, () => console.log(`VORTEX TaskBot › http://localhost:${PORT}`));
  })
  .catch((e) => {
    console.error('شروع ناموفق:', e);
    process.exit(1);
  });