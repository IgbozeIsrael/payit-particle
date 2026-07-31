# Local production testing

This guide helps you run the backend in a production-like mode locally and expose it over the internet for webhook testing (Telegram, Nuvion, fiat webhooks).

Steps:

1. From the backend folder run the PowerShell helper (uses localtunnel):

```powershell
cd payit-particle\payit-particle
.
\scripts\start-prod-local.ps1
```

2. The script will copy `.env.production` -> `.env` if `.env` does not exist.
   Edit `.env` and fill in real secrets. At minimum set `TELEGRAM_BOT_TOKEN`,
   `NUVION_API_KEY`, and `KEY_ENCRYPTION_SECRET`.

3. The script attempts to launch `npx localtunnel` and prints the public URL.
   Update `TELEGRAM_WEBHOOK_URL` in `.env` if needed.

4. The server will start in `NODE_ENV=production` and use the `.env` file in
   the backend folder.

Security note: Never commit real secrets to git. Use a secret manager for CI/CD.
