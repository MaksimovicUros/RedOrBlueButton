FROM node:20-alpine

WORKDIR /app

# Install build tools for better-sqlite3
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --only=production

COPY . .

# Create data directory
RUN mkdir -p /data

EXPOSE 3000

CMD ["node", "server.js"]
