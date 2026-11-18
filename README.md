# MultiThreads

Платформа керування великою кількістю Threads-акаунтів через **офіційний Threads API** (Meta).
Next.js 16 + Supabase (Postgres, Auth, Storage, pg_cron) + Vercel. **Без окремого сервера і Redis.**

## Архітектура

```
 Supabase pg_cron ──(щохвилини POST + CRON_SECRET)──► Vercel: /api/cron/tick
                                                        │ 1. просуває публікації «в процесі» (медіа оброблено → publish)
                                                        │ 2. захоплює нові, у яких настав час (≤1 на акаунт, SKIP LOCKED)
                                                        │ 3. обслуговування: розклади, мережа, статистика, токени
 Vercel: Next.js 16 (панель, Server Actions, OAuth)     ▼
        │                                      graph.threads.net (v1.0)
        ▼
 Supabase: Postgres + RLS · Auth · Storage "media"
```

Публікація в Threads двоетапна (контейнер → ~30 с обробки → publish), тому кожен пост проходить **кілька коротких тіків**,
а не чекає в одному виклику. Жоден виклик не триває довше ~45 с — вкладається в ліміти Vercel навіть на безкоштовному тарифі.
**Джерело правди — Postgres**: редагування/скасування — це зміна рядка в БД.

### Модель даних
`accounts` (+`account_secrets` — зашифрований токен, недоступний клієнту) · `account_groups` (проєкт/країна/тематика) ·
`posts` (контент) → `publications` (пост × акаунт × час, статуси, спроби, помилки, permalink) · `schedules` (повторювані правила) ·
`campaigns` · `network_configs` (+`network_secrets`) · `publication_insights`, `account_insights` · `logs` · `profiles` (ролі) · `app_settings`.

### Життєвий цикл публікації
`draft → scheduled → queued → publishing → published`
↘ `failed` (контент / вичерпані спроби) · `paused` (акаунт без авторизації / на паузі) · `cancelled`.

| Помилка API | Дія |
|---|---|
| 190 / 401 / відкликані дозволи | акаунт → `auth_error`, усі його публікації → `paused` до повторного OAuth |
| 429, коди 4/17/32/613 | відкласти: 15 → 30 → 60 … хв, акаунт → `rate_limited` |
| 5xx / мережа | експоненційний повтор 1 → 2 → 4 … хв (макс. спроб — у Settings) |
| інші 4xx (контент) | `failed` з повідомленням |

Перед кожною публікацією перевіряється власний ліміт акаунта (≤250/24 год — жорсткий ліміт Threads) і мінімальний інтервал.
Публікація ідемпотентна: якщо контейнер уже створено/опубліковано, повтор не дублює пост.
Один акаунт — одна публікація в процесі одночасно.

## Що перевірено в Threads API (листопад 2026)
- Публікація двоетапна: контейнер `POST /{user}/threads` → `POST /{user}/threads_publish`. TEXT / IMAGE / VIDEO / CAROUSEL (2–20).
- Ліміт 250 постів і 1000 відповідей на профіль за 24 год; `GET /{user}/threads_publishing_limit`.
- Текст ≤500 символів, ≤5 унікальних посилань (інакше помилка на створенні контейнера).
- Медіа Threads забирає з **публічного URL** (тому Storage bucket публічний).
- Токени: short-lived (1 год) → long-lived (60 днів), продовження `th_refresh_token` (токен ≥24 год). Планувальник продовжує автоматично.
- Немає в API → **не імітується**: нативне відкладене планування (робить власний engine), редагування опублікованих постів,
  вхід за паролем, DM. Реєстр — `src/lib/threads/capabilities.ts`, видно в Settings.

## Запуск

### 1. Supabase
1. Створити проєкт → SQL Editor → виконати по черзі `0001_init.sql`, `0002_engine.sql`, `0003_no_worker.sql` з `supabase/migrations/`.
   Database → Extensions: увімкнути **pg_cron** і **pg_net**.
2. Auth → Providers → Email увімкнено. Перший зареєстрований користувач стає **owner**.

### 2. Meta / Threads app
1. developers.facebook.com → Create App → use case **Access the Threads API**.
2. Дозволи: `threads_basic`, `threads_content_publish`, `threads_manage_insights`, `threads_read_replies`, `threads_manage_replies`.
3. Redirect Callback URL: `https://<ваш-домен>/api/threads/callback` (Meta вимагає HTTPS).
4. Поки застосунок у Development — підключати можна лише акаунти, додані як **Threads Testers** (і прийняті в налаштуваннях Threads).
   Для довільних акаунтів — пройти **App Review** (Advanced Access) з описом сценарію.

### 3. Змінні середовища
`cp .env.example .env.local` і заповнити. Ключ шифрування — 32 байти base64, `CRON_SECRET` — будь-який довгий випадковий рядок.

### 4. Планувальник (pg_cron)
Після першого деплою на Vercel: Supabase → SQL Editor → розкоментувати й виконати блок у кінці
`supabase/migrations/0003_no_worker.sql`, підставивши свій домен і `CRON_SECRET`.
Перевірка: `select * from cron.job_run_details order by start_time desc limit 5;`

### 5. Локально (необов’язково)
```bash
npm i
npm run dev          # панель: http://localhost:3000
npm test             # юніт-тести логіки (розклади, розподіл, ретраї, шифрування)
DEMO_MODE=1 npm run dev   # перегляд інтерфейсу з тестовими даними, без Supabase
```

### Продакшн
Як zakordonom: репозиторій на GitHub → Vercel автодеплой. Env-змінні з `.env.example` додати у Vercel → Settings → Environment Variables.

## Підключення акаунтів
Accounts → «Підключити акаунт» → Meta просить увійти в Threads і дати дозволи → токен шифрується (AES-256-GCM) і зберігається
в `account_secrets`. Для кожного наступного акаунта — вийти з попереднього в браузері (або окремий профіль браузера) і повторити.
Пароль Threads сервіс не бачить і не зберігає. «Відключити» знищує токен (відкликання доступу).

## Bulk Upload (CSV)
Колонки: `text, media_urls, accounts, scheduled_at, campaign`. Режими: по черзі між акаунтами / кожен рядок на всі / за колонкою `accounts`.
Без дати — час рахується від «Старт» з кроком N хв окремо для кожного акаунта. Перегляд і валідація перед імпортом.

## Безпека
Токени й паролі проксі — лише в окремих таблицях без RLS-політик (доступ тільки service role) і зашифровані.
Ролі owner/admin/editor/viewer перевіряються і в RLS, і в кожному server action. Усі дії користувачів і engine пишуться в `logs`.

## Наступні етапи
- Webhooks Threads (replies/mentions) → модуль модерації відповідей.
- Шаблони/спінтакс для варіацій тексту між акаунтами.
- Експорт аналітики, графіки по акаунтах.
- Розширення `capabilities.ts`, коли Meta додасть нові можливості.


## Запуск у продакшені (чек-лист)

1. **Supabase → SQL Editor**: по черзі виконати `supabase/migrations/0001…0004` (у 0004 спершу рядок `alter type … add value 'pending'`, потім решту окремим запуском). У кінці 0003 — блок `cron.schedule` з вашим доменом і `CRON_SECRET`.
2. **Supabase → Authentication → URL Configuration**: Site URL = `https://ВАШ-ДОМЕН`, Redirect URLs = `https://ВАШ-ДОМЕН/auth/confirm`.
3. **Vercel → Environment Variables**: усі змінні з `.env.example`.
4. **Meta for Developers → застосунок з use case «Access the Threads API»**:
   - Redirect Callback URL: `https://ВАШ-ДОМЕН/api/threads/callback`
   - Uninstall Callback URL: `https://ВАШ-ДОМЕН/api/threads/deauthorize`
   - Delete Callback URL: `https://ВАШ-ДОМЕН/api/threads/delete`
   - Privacy Policy URL: `https://ВАШ-ДОМЕН/privacy`
   - App roles → Threads Testers: додати акаунти й прийняти запрошення в Threads (Налаштування → Акаунт → Website permissions).
   - App ID і App Secret → `THREADS_APP_ID`, `THREADS_APP_SECRET` у Vercel, Redeploy.
5. Першим зареєструватися в панелі (стає owner). Нові користувачі отримують статус «без доступу», доки owner не видасть роль у Settings.
