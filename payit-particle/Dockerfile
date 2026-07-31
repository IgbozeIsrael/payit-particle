FROM node:20-alpine

# Install build tools for native addons like better-sqlite3
RUN apk add --no-cache python3 make g++ gcc sqlite-dev

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY . .

ENV NODE_ENV=production

CMD ["node", "src/server.js"]
