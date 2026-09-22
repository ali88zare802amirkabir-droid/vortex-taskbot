// VORTEX TaskBot — دستیار هوش مصنوعی چندارائهدهنده
// Gemini / OpenAI / Groq / هر API سازگار با OpenAI (DeepSeek، OpenRouter، ...)
// ترتیب فالبک: Gemini ← OpenAI ← Groq ← OpenRouter/similar.
// اگر هیچ کلیدی ست نشده باشد هیوریستیک لوکال پاسخ میدهد.

const MAX_WAIT = 25000; // حداکثر زمان کل هر درخواست
const PER_CALL = 13000; // حداکثر زمان هر ارائهدهنده

const SYSTEM = `تو یک ارزیاب پروژه هستی. بر اساس «عنوان» و «توضیحات»، درجه سختی، اولویت و تگها را تعیین کن.
فقط یک JSON معتبر برگردان، بدون متن اضافه و بدون بلاک کد، به این شکل دقیق:
{"difficulty":"normal","priority":1,"tags":["tag"]}
- difficulty فقط یکی از این سه است: easy | normal | hard (ساده/متوسط/سخت)
- priority فقط یکی از این سه است: 0 (کم) | 1 (متوسط) | 2 (بالا)
- tags: حداکثر 4 تگ کوتاه (فارسی یا انگلیسی)`;

function providers() {
  const list = [];
  const geminiKey = process.env.GEMINI_API_KEY || (!process.env.AI_API_BASE ? process.env.AI_API_KEY : '');
  if (geminiKey) list.push({ id: 'gemini', name: 'Gemini', key: geminiKey, model: process.env.GEMINI_MODEL || 'gemini-2.5-flash' });
  if (process.env.OPENAI_API_KEY) list.push({ id: 'openai', name: 'OpenAI', key: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL || 'gpt-4o-mini', base: process.env.OPENAI_API_BASE || 'https://api.openai.com/v1' });
  if (process.env.GROQ_API_KEY) list.push({ id: 'groq', name: 'Groq', key: process.env.GROQ_API_KEY, model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant', base: 'https://api.groq.com/openai/v1' });
  const genKey = process.env.AI_API_KEY;
  const genBase = process.env.AI_API_BASE;
  if (genKey && genBase && !list.some((p) => p.id === 'generic')) list.push({ id: 'generic', name: process.env.AI_PROVIDER_NAME || 'AI', key: genKey, model: process.env.AI_MODEL || 'default', base: genBase });
  return list;
}

function configured() {
  return providers().map((p) => p.name);
}

function withTimeout(promise, ms) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve(null); });
  });
}

async function callProvider(p, prompt) {
  if (p.id === 'gemini') {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + p.model + ':generateContent?key=' + p.key, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2 } }),
    });
    if (!r.ok) throw new Error('gemini ' + r.status);
    const d = await r.json();
    return (d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts && d.candidates[0].content.parts[0] && d.candidates[0].content.parts[0].text) || '';
  }
  const r = await fetch(p.base.replace(/\/$/, '') + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + p.key },
    body: JSON.stringify({ model: p.model, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }], temperature: 0.2 }),
  });
  if (!r.ok) throw new Error(p.id + ' ' + r.status);
  const d = await r.json();
  return (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '';
}

function parseJson(s) {
  s = (s || '').trim();
  if (s.startsWith('```')) s = s.replace(/^```[a-z]*\s*/i, '').replace(/```$/, '').trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try { return JSON.parse(s.slice(start, end + 1)); } catch (_) { return null; }
}

async function classify(title, description) {
  return withTimeout((async () => {
    const prompt = SYSTEM + '\n\nعنوان: ' + title + (description ? '\nتوضیحات: ' + description : '');
    for (const p of providers()) {
      const text = await withTimeout(callProvider(p, prompt), PER_CALL);
      const j = text ? parseJson(text) : null;
      if (j && ['easy', 'normal', 'hard'].includes(j.difficulty)) {
        return {
          ok: true,
          provider: p.name,
          difficulty: j.difficulty,
          priority: [0, 1, 2].includes(j.priority) ? j.priority : 1,
          tags: Array.isArray(j.tags) ? j.tags.map((t) => String(t).trim().slice(0, 30)).filter(Boolean).slice(0, 4) : [],
        };
      }
    }
    return null;
  })(), MAX_WAIT);
}

function heuristic(title, description) {
  const t = (title + ' ' + (description || '')).toLowerCase();
  const hard = ['دیتابیس', 'بانک اطلاعاتی', 'postgres', 'mysql', 'backend', 'server', 'سرور', 'api', 'auth', 'رمزنگاری', 'امنیت', 'security', 'docker', 'deploy', 'دیپلوی', 'معماری', 'میکروسرویس', 'هوش مصنوعی', 'یادگیری', 'machine learning', 'network', 'شبکه', 'پرداخت', 'gateway', 'همگام‌سازی', 'realtime', 'cache', 'کش', 'queue', 'صف', 'scale', 'مقیاس'];
  const easy = ['صفحه', 'لندینگ', 'landing', 'ui', 'ux', 'frontend', 'css', 'html', 'قالب', 'template', 'بنر', 'فونت', 'ترجمه', 'متن', 'ویرایش', 'ایمیل', 'newsletter', 'لوگو', 'logo', 'آیکون', 'icon', 'اسلاید', 'presentation', 'pdf', 'csv', 'ساده', 'تمیزکاری'];
  let h = 0, e = 0;
  hard.forEach((w) => { if (t.includes(w)) h++; });
  easy.forEach((w) => { if (t.includes(w)) e++; });
  const net = h - e;
  const difficulty = net >= 2 ? 'hard' : (net <= -1 ? 'easy' : 'normal');
  return { ok: true, provider: 'هیوریستیک', difficulty, priority: difficulty === 'hard' ? 2 : (difficulty === 'easy' ? 0 : 1), tags: [] };
}

module.exports = { configured, classify, heuristic };