# JobPulse India — 2026 Fresher Edition (No WhatsApp)

Vercel hosts the dashboard. GitHub Actions runs the collector approximately every 30 minutes.

## Target roles

- Software Development
- Data Engineering
- Data Analytics
- Data Science
- Machine Learning / AI

The matching profile is configured for a 2026 graduate/fresher and excludes internships and clearly senior/experienced roles.

## GitHub setup

The workflow is at `.github/workflows/refresh.yml` and can be started manually from **GitHub → Actions → Refresh 2026 fresher jobs → Run workflow**.

The workflow safely synchronizes with the latest `main` branch before pushing generated `jobs.json`, avoiding the common non-fast-forward error.

## Live job sources

The collector supports:

- Ashby public job boards (default: `aiprise,ontic,sarvam`)
- Greenhouse public boards via `GREENHOUSE_BOARDS`
- Adzuna India via `ADZUNA_APP_ID` and `ADZUNA_APP_KEY`

Add API credentials as GitHub Actions secrets. Never put API keys in `index.html` or other public files.

## Vercel

Vercel serves `index.html` and `jobs.json`. When GitHub Actions commits a new `jobs.json`, the connected Vercel project can redeploy automatically.

## Important

The dashboard can only show jobs supplied by the configured feeds. More feeds/board tokens increase coverage. No WhatsApp functionality is included in this version.
