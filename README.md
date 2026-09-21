# VORTEX TaskBot 🤖

رباتِ تقسیمِ رندومِ پروژه‌ها بین «من» و «رفیق». با تم پیام‌رسان VORTEX (دارک، `#031427`، فونت Vazirmatn).

- 📦 پروژه‌ها رو توی «انبار» نگه می‌دارد
- 🎲 ربات رندوم و عادلانه (به نفرِ کم‌کار بر می‌خورد) بین دو نفر تقسیم می‌کند
- ↩️ اگر کسی گفت «نمیتونم»، پروژه برمی‌گردد انبار و ربات یک پروژه‌ی تصادفیِ دیگر به همان نفر می‌دهد
- ▶️ / ✅ شروع و تکمیل پروژه‌ها
- 📤 تقسیم یک‌باره‌ی همه‌ی انبار (شافل + دورگرد / round-robin)
- 📡 هم‌زمان بین دو دستگاه (پوینگ هر ۸ ثانیه)

## اجرای لوکال (بدون دیتابیس)

نیاز: Node.js 18+

```
npm install
npm start
```

دیتا به‌صورت فایل `data/db.json` ذخیره می‌شود (صفر تا صفر، بدون PostgreSQL).
باز کنید: http://localhost:3000

تست‌ها:

```
npm test
```

## اجرا با PostgreSQL کامل (موتور Render رایگان)

روی Render دو راه دارید:

### راه ۱ — Blueprint (دستور render.yaml در این پروژه)
1. کد را به یک مخزن GitHub پوش کنید.
2. در Render → `New +` → **Blueprint** → مخزن را انتخاب کنید.
3. `render.yaml` خودش **Postgres رایگان** + سرویس وب را می‌سازد و `DATABASE_URL` را به سرویس وصل می‌کند.
4. اولین دیپلوی تمام شد. آدرس سرویس همان اپ شماست.

### راه ۲ — دستی (همین ساختار، کنترل بیشتر)
1. `New +` → **PostgreSQL** (plan: free) و یادداشتِ `connectionString` داخلی.
2. `New +` → **Web Service** → مخزن را انتخاب کنید.
   - Environment: **Docker** (Dockerfile همین پروژه)
   - Plan: **Free**
3. در بخش Environment:
   - `NODE_ENV = production`
   - `TRUST_PROXY = 1`
   - `DATABASE_URL = <connectionString از Postgres>`
4. دومی ۱۰–۱۵ ثانیه — خود سرور موقع بالا آمدن جدول‌ها را می‌سازد (نیازی به migrate دستی نیست).

> چون Render Free بعد از بی‌استفاده‌ای می‌خوابد، اولین بازدید چند ثانیه صبر می‌کند. طبیعی است.

### حین توسعه با دیتابیس واقعی
اگر `DATABASE_URL` ست باشد، اپ خودکار از Postgres می‌خواند/می‌نویسد. ساخت جدول‌ها هم دستی:

```
npm run db:migrate
```

## API

| متد | مسیر | توضیح |
|---|---|---|
| GET | `/api/state` | کل state + آمار |
| POST | `/api/users/:id` | نام/رنگ/فعال‌سازی (`{name,color,disabled}`) |
| POST | `/api/projects` | افزودن پروژه |
| PUT | `/api/projects/:id` | ویرایش پروژه |
| DELETE | `/api/projects/:id` | حذف پروژه |
| POST | `/api/assign` | قرعه: `{userId?, projectId?}` — نبود = رندوم |
| POST | `/api/assign-all` | تقسیم عادلانه‌ی کل انبار |
| POST | `/api/projects/:id/action` | `{action:"start"\|"done"}` |
| POST | `/api/projects/:id/cant` | «نمیتونم» → برگشت به انبار + تخصیص جدید |
| POST | `/api/reset` | `{mode:"assignments"\|"all"}` |

## ساختار

```
server.js          سرور Express + API
db.js              لایه دیتابیس (PostgreSQL / فایل JSON)
lib/engine.js      موتور رندوم (تُست‌شده)
db/schema.sql      اسکیمای PostgreSQL
db/migrate.js      ساخت جدول‌ها
public/            فرانت‌اند (تم پیام‌رسان Vortex)
tests/             تست‌های موتور
Dockerfile, render.yaml   دیپلوی روی Render
```