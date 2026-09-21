// VORTEX TaskBot — ساخت/به‌روزرسانی جدول‌ها روی PostgreSQL
// استفاده: npm run db:migrate
// اگر DATABASE_URL ست نباشه (حالت لوکال), فقط پیام اطلاع‌رسانی می‌دهد.

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log('DATABASE_URL ست نشده — حالت لوکال (JSON file). چیزی برای migrate نیست.');
    return;
  }
  const pool = new Pool({ connectionString: url });
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(sql);
    console.log('✅ PostgreSQL schema آماده است (users, projects, events, meta).');
  } catch (e) {
    console.error('❌ migrate ناموفق:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();