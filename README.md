# JobPulse India — Role + City + Telegram

This is a beginner-friendly static Vercel dashboard plus a GitHub Actions collector.

## What it does
- Refreshes approximately every 30 minutes through GitHub Actions.
- Collects from multiple permitted/public job feeds: Ashby, Lever, Greenhouse (when configured), and Adzuna (when configured).
- Filters to India and your target roles/cities.
- Avoids senior/leadership roles by default because the profile is early-career.
- Deduplicates listings by application URL.
- Updates `jobs.json` for the Vercel dashboard.
- Sends a Telegram message only when new matching jobs are found.
- Shows role and city category filters in the dashboard.

## GitHub Secrets
In **Settings → Secrets and variables → Actions**, add:
- `TELEGRAM_BOT_TOKEN` — your BotFather token
- `TELEGRAM_CHAT_ID` — your Telegram chat ID (currently 5775236222)
- `ADZUNA_APP_ID` — optional but strongly recommended for broad cross-company coverage
- `ADZUNA_APP_KEY` — optional but strongly recommended for broad cross-company coverage
- `ASHBY_BOARDS` — optional comma-separated Ashby board names
- `LEVER_SITES` — optional comma-separated Lever site names
- `GREENHOUSE_BOARDS` — optional comma-separated Greenhouse board tokens

Never commit a Telegram token or API key to the repository.

## Important coverage note
No single public API contains every employer's open roles. ATS feeds can be used where employers publish through them; Adzuna provides broad search coverage. For companies without a usable public feed, add their supported ATS board token/site name to the relevant secret rather than scraping their website.

## Deployment
The site is static and can be imported directly into Vercel with preset **Other** and root directory `./`.

The collector runs from GitHub Actions, not as a long-running Vercel server.

## Telegram behavior
No new matching jobs = no Telegram message. New jobs are grouped by role and city, and up to 10 of the best matches are included with Apply links.
