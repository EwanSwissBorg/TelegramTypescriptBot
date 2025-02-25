# BorgPad Telegram Bot

## Deploy production

```bash
wrangler deploy --config wrangler_production.toml
wrangler secret put BOT_TOKEN --config wrangler_production.toml
wrangler secret put TWITTER_CLIENT_ID --config wrangler_production.toml
wrangler secret put TWITTER_CLIENT_SECRET --config wrangler_production.toml
wrangler secret put TWITTER_CALLBACK_URL --config wrangler_production.toml
wrangler secret put BUCKET_URL --config wrangler_production.toml
curl "https://api.telegram.org/bot<PRODUCTION_BOT_TOKEN>/setWebhook?url=https://borgpad-bot-production.<votre-compte>.workers.dev"
curl "https://api.telegram.org/bot<PRODUCTION_BOT_TOKEN>/getWebhookInfo"
```

## Deploy staging

```bash
wrangler deploy --config wrangler_staging.toml
wrangler secret put BOT_TOKEN --config wrangler_staging.toml
wrangler secret put TWITTER_CLIENT_ID --config wrangler_staging.toml
wrangler secret put TWITTER_CLIENT_SECRET --config wrangler_staging.toml
wrangler secret put TWITTER_CALLBACK_URL --config wrangler_staging.toml
wrangler secret put BUCKET_URL --config wrangler_staging.toml
curl "https://api.telegram.org/bot<STAGING_BOT_TOKEN>/setWebhook?url=https://borgpad-bot-staging.<votre-compte>.workers.dev"
curl "https://api.telegram.org/bot<STAGING_BOT_TOKEN>/getWebhookInfo"
wrangler d1 execute borgpad-bot-staging-database --command "ALTER TABLE projects ADD COLUMN thumbnailPicture TEXT;" --config wrangler_staging.toml --remote
wrangler d1 execute borgpad-bot-staging-database --command "CREATE TABLE IF NOT EXISTS projects_json (id TEXT PRIMARY KEY, json TEXT NOT NULL);" --config wrangler_staging.toml --remote
wrangler secret put CF_ACCOUNT_ID --config wrangler_staging.toml
wrangler secret put CF_API_TOKEN --config wrangler_staging.toml
```