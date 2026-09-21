// VORTEX TaskBot — فرانتاند (تم پیامرسان)
const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));

const COLS = { bot: '#ffb877', pool: '#50e3c2' };
let STATE = null;
let activeChat = null;
let typingTimer = null;
let lastEventId = null;

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const DIFF = { easy: 'ساده', normal: 'متوسط', hard: 'سخت' };
const STAT = { available: '📦 در انبار', assigned: '🎁 سپرده‌شده', in_progress: '▶️ در حال انجام', done: '✅ تموم‌شده' };
const ETYPE = { assign: 'تخصیص', done: 'تکمیل', start: 'شروع', cant: 'نمیتونم', add: 'پروژه جدید', edit: 'ویرایش', delete: 'حذف', note: 'یادداشت' };

// ── ابزار ──
function toast(msg, err) {
  const t = document.createElement('div');
  t.className = 'toast' + (err ? ' err' : '');
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .4s'; }, 2600);
  setTimeout(() => t.remove(), 3050);
}

async function api(path, method = 'GET', body) {
  const opt = { method, headers: {} };
  if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  const r = await fetch(path, opt);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'خطا در ارتباط با سرور');
  return j;
}

function userById(id) { return (STATE.users || []).find((u) => u.id === id) || null; }
function projectById(id) { return STATE.projects.find((p) => p.id === id) || null; }
function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
}
function dayLabel(ts) {
  const d = new Date(ts);
  const today = new Date();
  const y = new Date(); y.setDate(y.getDate() - 1);
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(d, today)) return 'امروز';
  if (same(d, y)) return 'دیروز';
  return d.toLocaleDateString('fa-IR', { day: 'numeric', month: 'long' });
}
function fmtDeadline(dl) {
  if (!dl) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dl);
  if (!m) return dl;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return '🕓 ' + d.toLocaleDateString('fa-IR', { day: 'numeric', month: 'short' });
}

// ── لیست چت‌ها ──
function lastEventText() {
  if (!STATE.events.length) return 'پیامی نیست — پروژه اضافه کن';
  return STATE.events[STATE.events.length - 1].text;
}

function renderChatList() {
  const list = $('#chat-list');
  const pool = STATE.events.length ? lastEventText() : '0 پروژه در انبار';
  const chats = [
    { id: 'bot', av: '🤖', bg: 'rgba(255,184,119,.18)', title: 'ربات Vortex', tag: 'ربات', sub: lastEventText(), time: STATE.events.length ? fmtTime(STATE.events[STATE.events.length - 1].createdAt) : '' },
    { id: 'pool', av: '📦', bg: 'rgba(80,227,194,.15)', title: 'انبار پروژه‌ها', tag: '', sub: STATE.pool + ' پروژه آماده تخصیص', time: '' },
    ...STATE.users.map((u) => {
      const s = STATE.stats[u.id] || {};
      let sub;
      if (!s.active) sub = 'هیچ پروژه فعالی نداره';
      else sub = s.inProgress + ' در حال انجام · ' + s.active + ' فعال';
      return {
        id: u.id, av: (u.name || '؟').trim()[0], bg: u.color,
        title: u.name, tag: u.disabled ? 'غیرفعال' : '',
        sub: u.disabled ? 'فعلاً غیرفعال است' : sub,
        time: '',
      };
    }),
  ];
  list.innerHTML = '';
  for (const c of chats) {
    const item = document.createElement('button');
    item.className = 'chat-item' + (activeChat === c.id ? ' active' : '');
    item.dataset.id = c.id;
    item.innerHTML =
      `<span class="av" style="background:${c.bg}">${esc(c.av)}</span>` +
      `<span class="c-body">` +
        `<span class="c-title">${esc(c.title)}${c.tag ? `<span class="bot-tag">${esc(c.tag)}</span>` : ''}</span>` +
        `<span class="c-sub">${esc(c.sub)}</span>` +
      `</span>` +
      `<span class="c-time">${esc(c.time)}</span>`;
    item.addEventListener('click', () => selectChat(c.id));
    list.appendChild(item);
  }
  $('#foot-pool').textContent = `📦 ${STATE.pool} در انبار · ${(STATE.stats[STATE.users[0]?.id] || {}).done || 0} تموم‌شده`;
}

// ── انتخاب چت ──
function selectChat(id, push) {
  activeChat = id;
  renderChatList();
  renderView();
  if (push !== false && window.innerWidth <= 780) {
    $('#col').classList.add('open');
  }
}

// ── رندر نما ──
function renderView() {
  const head = $('#cv-head');
  const body = $('#cv-body');
  const foot = $('#cv-input');
  if (!activeChat) {
    body.innerHTML = `<div class="empty"><div class="empty-logo">V</div><h2>VORTEX TaskBot</h2><p>برای دیدن مکالمه یک چت انتخاب کن.</p></div>`;
    foot.innerHTML = '';
    return;
  }

  if (activeChat === 'bot') {
    const sub = STATE.users.filter((u) => !u.disabled);
    head.innerHTML = `
      <button class="icon-btn mobile-only" id="btn-back" title="بازگشت"><svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg></button>
      <span class="av" style="background:${COLS.bot}22;color:${COLS.bot};font-size:24px">🤖</span>
      <div class="head-meta"><div class="head-name">ربات Vortex</div><div class="head-sub">تقسیم عادلانه بین ${sub.map((u) => esc(u.name)).join(' و ')}</div></div>`;
    renderBotView(body);
    renderBotInput(foot);
  } else if (activeChat === 'pool') {
    head.innerHTML = `
      <button class="icon-btn mobile-only" id="btn-back" title="بازگشت"><svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg></button>
      <span class="av" style="background:rgba(80,227,194,.15);font-size:22px">📦</span>
      <div class="head-meta"><div class="head-name">انبار پروژه‌ها</div><div class="head-sub">${STATE.pool} پروژه آماده · اینجا پروژه بساز</div></div>`;
    renderPoolView(body);
    renderPoolInput(foot);
  } else {
    const u = userById(activeChat);
    if (!u) { selectChat('bot'); return; }
    const s = STATE.stats[u.id] || {};
    head.innerHTML = `
      <button class="icon-btn mobile-only" id="btn-back" title="بازگشت"><svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg></button>
      <span class="av" style="background:${u.color}">${esc((u.name || '؟').trim()[0])}</span>
      <div class="head-meta">
        <div class="head-name">${esc(u.name)}</div>
        <div class="head-sub">
          <span class="stat-chip">🎁 <b>${s.active}</b> فعال</span>
          <span class="stat-chip">▶️ <b>${s.inProgress}</b> در حال انجام</span>
          <span class="stat-chip">✅ <b>${s.done}</b> تموم‌شده</span>
          <span class="stat-chip">↩️ <b>${s.rejected}</b> نمیتونم</span>
        </div>
      </div>`;
    renderUserView(body, u);
    foot.innerHTML = '';
  }
  bindBack();
}

function bindBack() {
  const b = $('#btn-back');
  if (b) b.addEventListener('click', () => { $('#col').classList.add('open'); });
}

// ── نمای ربات ──
function renderBotView(body) {
  let html = `
    <div class="day-sep"><span>چت ربات Vortex 🤖</span></div>
    <div class="msg bot">
      <span class="av-mini">🤖</span>
      <div class="bubble">
        <span class="t-type note">خوش اومدی!</span>
        من ربات «Vortex TaskBot» هستم. پروژه‌ها رو توی انبار بساز، بعد 🎲 یا 📤
        رو بزن تا رندوم و عادلانه بین ${STATE.users.filter((u) => !u.disabled).map((u) => esc(u.name)).join(' و ')} تقسیم کنم.
      </div>
    </div>`;
  if (!STATE.events.length) {
    html += `<div class="msg bot"><span class="av-mini">🤖</span><div class="bubble">هنوز اتفاقی نیفتاده. اولین پروژه رو از چت «📦 انبار پروژه‌ها» اضافه کن.</div></div>`;
  }
  let lastDay = '';
  for (const e of STATE.events) {
    const day = dayLabel(e.createdAt);
    if (day !== lastDay) { html += `<div class="day-sep"><span>${day}</span></div>`; lastDay = day; }
    html += `<div class="msg bot">
      <span class="av-mini">🤖</span>
      <div class="bubble">
        <span class="t-type ${esc(e.type)}">${ETYPE[e.type] || 'یادداشت'}</span>
        ${esc(e.text)}
        <span class="m-time">${fmtTime(e.createdAt)}</span>
      </div>
    </div>`;
  }
  body.innerHTML = html;
  scrollBottom(true);
}

function renderBotInput(foot) {
  foot.innerHTML = `
    <div class="ci-row" style="justify-content:center">
      <button class="btn primary" id="bn-assign">🎲 یه پروژه رندوم بده</button>
      <button class="btn" id="bn-assign-all">📤 تقسیم همه‌ی انبار</button>
    </div>
    <div class="ci-row" style="justify-content:center">
      <span class="hint" style="font-size:11.5px;color:var(--outline)">از چت هر نفر هم می‌تونی روی پروژه «↩️ نمیتونم» بزنی تا ربات یکی دیگه بده.</span>
    </div>`;
  $('#bn-assign').addEventListener('click', () => botAction(() => api('/api/assign', 'POST', {})));
  $('#bn-assign-all').addEventListener('click', () => botAction(() => api('/api/assign-all', 'POST', {})));
}

async function botAction(fn) {
  const body = $('#cv-body');
  const typing = document.createElement('div');
  typing.className = 'msg bot';
  typing.id = 'typing';
  typing.innerHTML = `<span class="av-mini">🤖</span><div class="bubble"><span class="typing"><i></i><i></i><i></i></span></div>`;
  body.appendChild(typing);
  scrollBottom(true);
  await new Promise((r) => setTimeout(r, 650 + Math.random() * 500));
  try {
    const res = await fn();
    await reload();
    renderView();
    if (res && res.error) toast(res.error, true);
  } catch (e) {
    typing.remove();
    await reload();
    renderView();
    toast(e.message, true);
  }
}

// ── نمای انبار ──
function renderPoolView(body) {
  const avail = STATE.projects.filter((p) => p.status === 'available');
  let html = `<div class="day-sep"><span>پروژه‌های آماده برای قرعه‌کشی 📦</span></div>`;
  if (!avail.length) {
    html += `<div class="msg"><div class="bubble">انبار خالیه! از فرم پایین اولین پروژه رو اضافه کن.</div></div>`;
  }
  for (const p of avail) html += projectCard(p, { pool: true });
  body.innerHTML = html;
}

function renderPoolInput(foot) {
  foot.innerHTML = `
    <form class="pool-form" id="pool-form">
      <div class="ci-row grow">
        <input id="pool-title" maxlength="80" placeholder="عنوان پروژه + Enter..." required />
        <button class="btn primary" type="submit">➕</button>
      </div>
      <div class="ci-row">
        <input id="pool-desc" maxlength="200" placeholder="توضیح کوتاه (اختیاری)" />
        <select id="pool-diff" style="width:110px">
          <option value="easy">ساده</option><option value="normal" selected>متوسط</option><option value="hard">سخت</option>
        </select>
        <input id="pool-deadline" type="date" style="width:140px" />
      </div>
      <div class="hint">بعدا توی مودال می‌تونی تگ و اولویت هم بدی.</div>
    </form>`;
  const form = $('#pool-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = $('#pool-title').value.trim();
    if (!title) return;
    try {
      await api('/api/projects', 'POST', {
        title,
        description: $('#pool-desc').value.trim(),
        difficulty: $('#pool-diff').value,
        deadline: $('#pool-deadline').value,
      });
      await reload();
      renderView();
      form.reset();
      toast('پروژه اضافه شد ✅');
    } catch (err) { toast(err.message, true); }
  });
}

// ── نمای کاربر ──
function renderUserView(body, u) {
  const mine = STATE.projects
    .filter((p) => p.assignedTo === u.id)
    .sort((a, b) => (a.status === 'done') - (b.status === 'done') || b.updatedAt - a.updatedAt);

  let html = '';
  html += `<div class="section-title">🎁 {@title}</div>`.replace('{@title}', 'پروژه‌های فعال');
  const active = mine.filter((p) => p.status !== 'done');
  if (!active.length) {
    html += `<div class="msg"><div class="bubble">پروژه فعالی نداری. از ربات 🎲 بخواه یه پروژه بده.</div></div>`;
  }
  for (const p of active) html += projectCard(p, { user: u.id });
  const done = mine.filter((p) => p.status === 'done');
  if (done.length) {
    html += `<div class="section-title">✅ تموم‌شده (${done.length})</div>`;
    for (const p of done) html += projectCard(p, { user: u.id, done: true });
  }
  body.innerHTML = html;
}

// ── کارت پروژه ──
function projectCard(p, o) {
  const u = userById(p.assignedTo);
  let chips = `<span class="chip ${esc(p.difficulty)}">${DIFF[p.difficulty] || 'متوسط'}</span>`;
  chips += `<span class="chip p${p.priority}">${p.priority === 2 ? 'بالا 🔥' : p.priority === 0 ? 'کم' : 'متوسط'}</span>`;
  const dl = fmtDeadline(p.deadline);
  if (dl) chips += `<span class="chip deadline">${dl}</span>`;
  const tags = (p.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('');

  let actions = '';
  if (o && o.pool) {
    actions += `<button class="btn primary sm" data-act="assign-rnd" title="قرعه رندوم">🎲</button>`;
    for (const uu of STATE.users) {
      if (uu.disabled) continue;
      actions += `<button class="btn sm" data-act="assign" data-uid="${uu.id}">به ${esc(uu.name)}</button>`;
    }
    actions += `<button class="btn ghost sm" data-act="edit">✏️</button>`;
    actions += `<button class="btn danger sm" data-act="del">🗑</button>`;
  } else if (o && o.user) {
    const status = p.status;
    if (!o.done) {
      if (status === 'assigned') {
        actions += `<button class="btn sm" data-act="start">▶️ شروع کن</button>`;
        actions += `<button class="btn danger sm" data-act="cant">↩️ نمیتونم</button>`;
      } else if (status === 'in_progress') {
        actions += `<button class="btn primary sm" data-act="done">✅ تموم شد</button>`;
      }
      actions += `<button class="btn ghost sm" data-act="edit">✏️</button>`;
    }
  }

  const userLine = u
    ? `<div class="pc-user"><span class="mini-av" style="background:${u.color}">${esc((u.name || '?').trim()[0])}</span>${esc(STAT[p.status] || p.status)} · ${esc(u.name)}</div>`
    : `<div class="pc-user"><span style="color:var(--outline)">📦 در انبار</span></div>`;

  const card = document.createElement('div');
  card.className = 'project-card';
  card.dataset.id = p.id;
  card.innerHTML =
    `<div class="pc-top"><div class="pc-title${p.status === 'done' ? ' done' : ''}">${esc(p.title)}</div>${chips}</div>` +
    (p.description ? `<div class="pc-desc">${esc(p.description)}</div>` : '') +
    (tags ? `<div class="pc-tags">${tags}</div>` : '') +
    userLine +
    (actions ? `<div class="pc-actions">${actions}</div>` : '');

  card.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    e.stopPropagation();
    const p = projectById(card.dataset.id);
    if (!p) return;
    const act = btn.dataset.act;
    if (act === 'assign') fire(() => api('/api/assign', 'POST', { projectId: p.id, userId: btn.dataset.uid }));
    else if (act === 'assign-rnd') fire(() => api('/api/assign', 'POST', { projectId: p.id }));
    else if (act === 'cant') fire(() => api('/api/projects/' + p.id + '/cant', 'POST', {}));
    else if (act === 'start') fire(() => api('/api/projects/' + p.id + '/action', 'POST', { action: 'start' }));
    else if (act === 'done') fire(() => api('/api/projects/' + p.id + '/action', 'POST', { action: 'done' }));
    else if (act === 'edit') openProjectModal(p);
    else if (act === 'del') {
      if (!confirm('پروژه «' + p.title + '» حذف بشه؟')) return;
      fire(() => api('/api/projects/' + p.id, 'DELETE'));
    }
  });
  return card.outerHTML;
}

async function fire(fn) {
  const wasBot = activeChat === 'bot';
  try {
    const res = await fn();
    await reload();
    renderChatList();
    renderView();
    if (res && res.error) toast(res.error, true);
  } catch (e) {
    await reload();
    renderChatList();
    renderView();
    toast(e.message, true);
  }
}

// ── اسکرول ──
function scrollBottom(force) {
  const b = $('#cv-body');
  const near = b.scrollHeight - b.scrollTop - b.clientHeight < 80;
  if (force || near) b.scrollTop = b.scrollHeight;
}

// ── مودال پروژه ──
let editingId = null;
function openProjectModal(p) {
  editingId = p ? p.id : null;
  $('#modal-title').textContent = p ? 'ویرایش پروژه' : 'پروژه جدید';
  $('#pf-title').value = p ? p.title : '';
  $('#pf-desc').value = p ? p.description : '';
  $('#pf-difficulty').value = p ? p.difficulty : 'normal';
  $('#pf-priority').value = p ? String(p.priority) : '1';
  $('#pf-deadline').value = p && p.deadline ? p.deadline.split('T')[0] : '';
  $('#pf-tags').value = p ? (p.tags || []).join('، ') : '';
  $('#modal-project').classList.remove('hidden');
  $('#pf-title').focus();
}
function closeProjectModal() { $('#modal-project').classList.add('hidden'); editingId = null; }

async function saveProject() {
  const title = $('#pf-title').value.trim();
  if (!title) return toast('عنوان الزامی است', true);
  const body = {
    title,
    description: $('#pf-desc').value.trim(),
    difficulty: $('#pf-difficulty').value,
    priority: parseInt($('#pf-priority').value, 10),
    deadline: $('#pf-deadline').value,
    tags: $('#pf-tags').value.split(/[،,]/).map((t) => t.trim()).filter(Boolean),
  };
  try {
    if (editingId) await api('/api/projects/' + editingId, 'PUT', body);
    else await api('/api/projects', 'POST', body);
    closeProjectModal();
    await reload();
    renderChatList();
    renderView();
    toast('ذخیره شد ✅');
  } catch (e) { toast(e.message, true); }
}

// ── تنظیمات ──
function renderSettings() {
  const set = $('#set-users');
  set.innerHTML = '';
  for (const u of STATE.users) {
    const row = document.createElement('div');
    row.className = 'set-user';
    row.innerHTML = `
      <span class="mini-av" style="background:${u.color}">${esc((u.name || '?').trim()[0])}</span>
      <input type="text" data-f="name" maxlength="25" value="${esc(u.name)}" />
      <input type="color" data-f="color" value="${esc(u.color)}" />
      <button class="toggle" data-f="disabled" title="فعال/غیرفعال">${u.disabled ? '🙅' : '🙂'}</button>`;
    row.querySelector('[data-f=name]').addEventListener('change', async (e) => {
      try { await api('/api/users/' + u.id, 'POST', { name: e.target.value }); await reload(); renderSettings(); renderChatList(); } catch (err) { toast(err.message, true); }
    });
    row.querySelector('[data-f=color]').addEventListener('change', async (e) => {
      try { await api('/api/users/' + u.id, 'POST', { color: e.target.value }); await reload(); renderSettings(); renderChatList(); renderView(); } catch (err) { toast(err.message, true); }
    });
    row.querySelector('[data-f=disabled]').addEventListener('click', async () => {
      try { await api('/api/users/' + u.id, 'POST', { disabled: !u.disabled }); await reload(); renderSettings(); renderChatList(); renderView(); } catch (err) { toast(err.message, true); }
    });
    set.appendChild(row);
  }
  $('#reset-assign').onclick = async () => {
    if (!confirm('همه تخصیص‌ها ریست بشن (پروژه‌ها برگردن انبار)؟')) return;
    try { await api('/api/reset', 'POST', { mode: 'assignments' }); await reload(); renderChatList(); renderView(); toast('تخصیص‌ها ریست شد 🧹'); } catch (e) { toast(e.message, true); }
  };
  $('#reset-all').onclick = async () => {
    if (!confirm('حذف همه‌ی پروژه‌ها و لاگ؟ این غیرقابل بازگشته!')) return;
    try { await api('/api/reset', 'POST', { mode: 'all' }); await reload(); renderChatList(); renderView(); toast('همه‌چیز ریست شد 🧹'); } catch (e) { toast(e.message, true); }
  };
}

// ── کشیدن state ──
async function reload() {
  STATE = await api('/api/state');
  lastEventId = STATE.events.length ? STATE.events[STATE.events.length - 1].id : null;
  return STATE;
}

// ── زمین‌ها ──
function bindGlobal() {
  $('#btn-settings').addEventListener('click', () => {
    renderSettings();
    $('#modal-settings').classList.remove('hidden');
  });
  $('#btn-add-quick').addEventListener('click', () => openProjectModal(null));
  $('#pf-cancel').addEventListener('click', closeProjectModal);
  $('#pf-save').addEventListener('click', saveProject);
  $('#modal-project').addEventListener('click', (e) => { if (e.target.id === 'modal-project') closeProjectModal(); });
  $('#pf-title').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveProject(); });
  $('#set-close').addEventListener('click', () => $('#modal-settings').classList.add('hidden'));
  $('#modal-settings').addEventListener('click', (e) => { if (e.target.id === 'modal-settings') $('#modal-settings').classList.add('hidden'); });
  $('#col').addEventListener('click', (e) => { if (window.innerWidth > 780) return; if (e.target.closest('.chat-item')) $('#col').classList.remove('open'); });
}

// پینگ همزمانی بین دو دستگاه (هر ۸ ثانیه)
function startPolling() {
  setInterval(async () => {
    try {
      const prev = lastEventId;
      await reload();
      const cur = lastEventId;
      renderChatList();
      if (activeChat && !document.getElementById('typing')) renderView();
      else { /* nop */ }
      if (prev && cur && prev !== cur && activeChat !== 'bot') {
        toast('🤖 ربات پیام جدیدی فرستاد');
      }
    } catch { /* ignore offline */ }
  }, 8000);
}

// ── شروع ──
async function boot() {
  bindGlobal();
  try {
    await reload();
  } catch (e) {
    toast('اتصال به سرور برقرار نشد', true);
  }
  renderChatList();
  if (!activeChat) activeChat = 'bot';
  renderView();
  startPolling();
}

document.addEventListener('DOMContentLoaded', boot);