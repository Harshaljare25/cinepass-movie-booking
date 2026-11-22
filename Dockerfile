FROM node:20-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install build tools only if compiling native addons like sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev --build-from-source

COPY . .

EXPOSE 3000

CMD ["node", "backend/server.js"]