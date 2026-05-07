# ── Stage 1: Build Angular app ────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Build for production
RUN npm run build:prod

# ── Stage 2: Serve with nginx ─────────────────────────────────────────────────
FROM nginx:alpine

# Copy built assets
COPY --from=builder /app/dist/choice-poll/browser /usr/share/nginx/html

# nginx config with Angular router support + API proxy
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
