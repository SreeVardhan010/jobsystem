# JobPulse India — Vercel + GitHub Actions + Telegram

A beginner-friendly job dashboard that collects India job listings, classifies them by **role** and **city**, scores them against the profile, updates `jobs.json`, and sends a Telegram alert when new matching jobs are found.

## What it does
- Role categories: Software Engineer, Backend Engineer, Data Engineer, Machine Learning Engineer, Data Scientist, Full Stack Engineer, Python Developer.
- City categories: Bengaluru, Hyderabad, Chennai, Pune, Gurgaon, Mumbai, Noida, Delhi, Kolkata, Kochi, Ahmedabad, Remote India, Other India.
- Filters the dashboard by role and city.
- Sends Telegram alerts only for new matching jobs (score >= 50).
- Runs from GitHub Actions about every 30 minutes.
- Vercel hosts the website.

## GitHub Actions secrets
Add these under **Settings → Secrets and variables → Actions**:
- `TELEGRAM_BOT_TOKEN` — your BotFather token (never commit this).
- `TELEGRAM_CHAT_ID` — your private chat ID.
- `ASHBY_BOARDS` — optional comma-separated Ashby board names. Defaults to `aiprise,ontic,sarvam`.
- `GREENHOUSE_BOARDS` — optional comma-separated Greenhouse board tokens.
- `ADZUNA_APP_ID` and `ADZUNA_APP_KEY` — optional, for Adzuna.

## Deployment
The root contains `index.html`, so Vercel can deploy it as an Other/static project. The collector is **not** a Vercel server; it runs in GitHub Actions.

## Telegram behavior
No message is sent when there are no new matching jobs. When new jobs are found, the alert includes role and city categories plus direct employer/ATS application links.

## Important
Job feeds can change, close, or rate-limit. The collector only reports listings returned by configured sources at refresh time. It does not submit applications automatically.
