# JobPulse India — Vercel + GitHub Actions + Telegram

This project is designed for a simple setup:

**Vercel** hosts the dashboard. **GitHub Actions** runs the collector about every 30 minutes. The collector pulls published jobs from supported feeds, filters India, scores jobs against `profile.json`, deduplicates them, updates `jobs.json`, and optionally sends a Telegram message when new matching jobs appear.

## 1. Upload to GitHub

Create a GitHub repository (for example `jobpulse-india`) and upload the contents of this folder to the repository root. Do not upload any `.env` file or API tokens.

## 2. Connect GitHub to Vercel

In Vercel: **Add New → Project → Import** the GitHub repository → Deploy.

No build command is required. `index.html` is the static dashboard and `jobs.json` is its data source.

Vercel will automatically redeploy when GitHub receives a new commit.

## 3. Add GitHub Actions secrets

GitHub repository → **Settings → Secrets and variables → Actions → New repository secret**.

Required/optional secrets:

- `ASHBY_BOARDS` — comma-separated Ashby public board names, e.g. `aiprise,ontic,sarvam`
- `GREENHOUSE_BOARDS` — optional comma-separated Greenhouse board tokens
- `ADZUNA_APP_ID` — optional
- `ADZUNA_APP_KEY` — optional
- `TELEGRAM_BOT_TOKEN` — token from BotFather. Keep this secret.
- `TELEGRAM_CHAT_ID` — your private Telegram chat ID. Keep this as a GitHub Secret too.

Never put access tokens into `profile.json`, `index.html`, or public GitHub files.

## 4. Telegram setup
Telegram notifications use the Telegram Bot API. Create the bot with @BotFather, keep the bot token private, and open your bot in Telegram. Send `/start` (or any message) to it once. For a reliable setup, put your private `chat_id` in the `TELEGRAM_CHAT_ID` GitHub Secret. The collector also has a fallback to discover it from Telegram updates if the secret is omitted.

The collector only sends a Telegram message when it finds new matching jobs (score >= 50). It does not send a message when there are no new matches. Telegram's Bot API uses HTTPS requests and its `sendMessage` method sends text to a target chat.

## 5. Test before waiting 30 minutes

GitHub → **Actions → Refresh jobs and Telegram alerts → Run workflow**.

This manually starts the same workflow. Check the run logs. If Telegram is configured correctly and you have already sent `/start` to your bot, a message is sent only if the collector found new matching jobs.

## 6. Automatic refresh

The workflow is scheduled with:

`*/30 * * * *`

That means approximately every 30 minutes. GitHub scheduled workflows use cron and run on the default branch. They can occasionally be delayed by GitHub load.

## 7. Important limitation

The first run can send several alerts because the repository starts with an empty job history. After that, the collector compares job IDs with the existing `jobs.json` and avoids repeat alerts for the same listing.

## 8. Application behavior

The dashboard's **Apply Now** buttons open the employer/ATS application URL. The system does not automatically submit job applications.
