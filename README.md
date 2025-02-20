# BorgPad Telegram Bot

## Deploy production

```bash
wrangler deploy --config wrangler_production.toml
wrangler secret put BOT_TOKEN --config wrangler_production.toml
wrangler secret put TWITTER_CLIENT_ID --config wrangler_production.toml
wrangler secret put TWITTER_CLIENT_SECRET --config wrangler_production.toml
wrangler secret put TWITTER_CALLBACK_URL --config wrangler_production.toml
wrangler secret put BUCKET_URL --config wrangler_production.toml
```

## Deploy staging

```bash
wrangler deploy --config wrangler_staging.toml
wrangler secret put BOT_TOKEN --config wrangler_staging.toml
wrangler secret put TWITTER_CLIENT_ID --config wrangler_staging.toml
wrangler secret put TWITTER_CLIENT_SECRET --config wrangler_staging.toml
wrangler secret put TWITTER_CALLBACK_URL --config wrangler_staging.toml
wrangler secret put BUCKET_URL --config wrangler_staging.toml
```