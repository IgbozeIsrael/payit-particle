**Deployment & Local Run Guide**

- Build Docker image (from repo root):

```bash
docker build -f payit-particle/Dockerfile -t payit-particle:latest .
```

- Run locally (set required env vars; for development use provided `.env.example` as a template):

```bash
cd payit-particle
cp .env.example .env
# Edit .env and set KEY_ENCRYPTION_SECRET and required keys
export NODE_ENV=development
export KEY_ENCRYPTION_SECRET='dev_secret_change_me'
npm install
npm test
node src/server.js
```

- Recommended CI: use `.github/workflows/ci.yml` which installs, tests, and runs `npm audit`.

- Important: Do not run production with default or missing `KEY_ENCRYPTION_SECRET`. Set secure secrets in your environment or secret manager.
