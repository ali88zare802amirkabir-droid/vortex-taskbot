# VORTEX TaskBot 🤖

رباتِ تقسیمِ رندومِ پروژه‌ها بین «من» و «رفیق». با تم پیام‌رسان VORTEX (دارک، `#031427`، فونت Vazirmatn).

- 📦 پروژه‌ها رو توی «انبار» نگه می‌دارد
- 🎲 ربات رندوم و عادلانه (به نفرِ کم‌کار بر می‌خورد) بین دو نفر تقسیم می‌کند
- ↩️ اگر کسی گفت «نمیتونم»، پروژه برمی‌گردد انبار و ربات یک پروژه‌ی تصادفیِ دیگر به همان نفر می‌دهد
- ▶️ / ✅ شروع و تکمیل پروژه‌ها
- 📤 تقسیم یک‌باره‌ی همه‌ی انبار (شافل + دورگرد / round-robin)
- 🤖 درجه‌ی سختی و اولویتِ هر پروژه با هوش مصنوعی خودکار تعیین می‌شود (چند ارائه‌دهنده)
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

> ⚠️ هر ورک‌اسپیس Render فقط **یک دیتابیس رایگان** دارد. TaskBot از همان
> دیتابیس رایگان استفاده می‌کند ولی همه‌چیز را داخل **اسکیمای مجزای `taskbot`**
> می‌سازد و موقع بالا آمدن خودش جدول‌ها را می‌سازد (بدون نیاز به migrate دستی)؛
> پس دیتای بقیه اپ‌های شما دست نمی‌خورد.

### راه ۱ — Blueprint (render.yaml)
1. کد را به مخزن GitHub پوش کنید.
2. در Render → `New +` → **Blueprint** → مخزن را انتخاب کنید.
3. `DATABASE_URL` را با connectionString داخلیِ یکی از دیتابیس‌های موجود خودتان
   پر کنید (`internalConnectionString` از صفحه‌ی Postgres → Connect).

### راه ۲ — دستی
1. داشبورد Render → Postgres موجود → Connect → **Internal Connection String** را کپی کنید.
2. `New +` → **Web Service** → مخزن را انتخاب کنید.
   - Environment: **Docker** · Plan: **Free**
3. Environment Variables:
   - `NODE_ENV = production`
   - `TRUST_PROXY = 1`
   - `DATABASE_URL = <internalConnectionString>`

> چون Render Free بعد از بی‌استفاده‌ای می‌خوابد، اولین بازدید چند ثانیه صبر
> می‌کند. طبیعی است.

### حین توسعه با دیتابیس واقعی
اگر `DATABASE_URL` ست باشد، اپ خودکار از Postgres می‌خواند/می‌نویسد. ساخت جدول‌ها هم دستی:

```
npm run db:migrate
```

## هوش مصنوعی (خودکار کردن سختی)

موقع افزودن پروژه، اگر «سختی» دستی انتخاب نشود، ربات خودش تحلیل می‌کند
(عنوان + توضیحات → سختی `easy|normal|hard` و اولویت و تگ‌ها).

ترتیب فالبک ارائه‌دهنده‌ها (هرچندتا کلید داری همان‌ها فعال می‌شوند):
Gemini ← OpenAI ← Groq ← هر API سازگار با OpenAI (OpenRouter/DeepSeek/...)

| متغیر | توضیح |
|---|---|
| `GEMINI_API_KEY` + `GEMINI_MODEL` | Google Gemini (کلید رایگان: aistudio.google.com) |
| `OPENAI_API_KEY` + `OPENAI_MODEL` | OpenAI |
| `GROQ_API_KEY` + `GROQ_MODEL` | Groq (رایگان و سریع) |
| `AI_API_KEY` + `AI_API_BASE` + `AI_MODEL` + `AI_PROVIDER_NAME` | API سازگار با OpenAI |

> بدون هیچ کلیدی، یک **هیوریستیک لوکال** داخل اپ جواب می‌دهد؛ پس همیشه
> «خودکار» کار می‌کند.
> وضعیت ارائه‌دهنده‌ها را از **تنظیمات اپ** یا `GET /api/ai/status` ببین.

## API

| متد | مسیر | توضیح |
|---|---|---|
| GET | `/api/state` | کل state + آمار |
| POST | `/api/users/:id` | نام/رنگ/فعال‌سازی (`{name,color,disabled}`) |
| POST | `/api/projects` | افزودن پروژه (سختی دستی نده = AI خودکار) |
| GET | `/api/ai/status` | وضعیت ارائه‌دهنده‌های هوش مصنوعی |
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