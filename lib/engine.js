// VORTEX TaskBot — موتور رندوم تقسیم پروژه‌ها (پسند خالص، بدون وابستگی)
// این توابع هم در سرور و هم در تست استفاده می‌شن.

function shuffle(arr, rng) {
  const a = arr.slice();
  const rand = rng || Math.random;
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

function pick(arr, rng) {
  if (!arr || !arr.length) return null;
  const rand = rng || Math.random;
  return arr[Math.floor(rand() * arr.length)];
}

// تقسیم عادلانه: پروژه‌ها اول شافل می‌شن بعد به‌صورت دورگرد (round-robin)
// بین کاربرها پخش می‌شن. خروجی: { userId: [projectId, ...] }
function distribute(pool, userIds, rng) {
  const out = {};
  for (const id of userIds) out[id] = [];
  const deck = shuffle(pool, rng);
  if (!userIds.length) return out;
  deck.forEach((pid, i) => out[userIds[i % userIds.length]].push(pid));
  return out;
}

// انتخاب کاربری که کمترین پروژه فعال رو داره (برای قرعه تک‌به‌تک)
function chooseUser(users, assignedCounts, rng) {
  const rand = rng || Math.random;
  const active = users.filter((u) => !u.disabled);
  if (!active.length) return null;
  let min = Infinity;
  for (const u of active) {
    if (u.disabled) continue;
    const c = assignedCounts[u.id] || 0;
    if (c < min) min = c;
  }
  const candidates = active.filter((u) => (assignedCounts[u.id] || 0) === min);
  return pick(candidates, rand);
}

module.exports = { shuffle, pick, distribute, chooseUser };