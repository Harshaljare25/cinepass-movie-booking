# Multi-stage lightweight Node.js Dockerfile for CinePass
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application files
COPY . .

EXPOSE 3000

CMD ["node", "server.js"]

