FROM node:20-alpine

# Install build tools for native addons like better-sqlite3
RUN apk add --no-cache python3 make g++ gcc sqlite-dev

WORKDIR /app

# Copy package files from payit-particle subdirectory
COPY payit-particle/package.json payit-particle/package-lock.json* ./
RUN npm install --no-audit --no-fund

# Copy application code
COPY payit-particle/ .

ENV NODE_ENV=production

CMD ["node", "src/server.js"]
