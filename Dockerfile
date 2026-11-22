FROM node:20-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy application files
COPY . .

EXPOSE 3000

CMD ["node", "server.js"]

