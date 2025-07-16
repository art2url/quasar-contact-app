# Multi-stage Docker build
FROM node:22-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./
COPY frontend/package*.json ./frontend/
COPY backend/package*.json ./backend/
COPY landing/package*.json ./landing/

# Install dependencies for all parts
RUN npm install
RUN cd frontend && npm install
RUN cd backend && npm install
RUN cd landing && npm install

# Copy source code
COPY . .

# Build the application with environment variables
# These will be replaced at build time with actual values
ARG NG_APP_API_URL
ARG NG_APP_WS_URL
ARG NG_APP_RECAPTCHA_SITE_KEY
ARG NODE_ENV=production

ENV NG_APP_API_URL=$NG_APP_API_URL
ENV NG_APP_WS_URL=$NG_APP_WS_URL
ENV NG_APP_RECAPTCHA_SITE_KEY=$NG_APP_RECAPTCHA_SITE_KEY
ENV NODE_ENV=$NODE_ENV

# Build all components from root
WORKDIR /app

# Build Angular frontend 
RUN cd frontend && npm run build

# Build Astro landing pages
RUN cd landing && npm run build

# Build Node.js backend
RUN cd backend && npm run build

# Production stage
FROM node:22-alpine AS production

# Install curl for health checks
RUN apk add --no-cache curl

WORKDIR /app

# Copy built assets from builder stage
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/package*.json ./backend/
COPY --from=builder /app/backend/prisma ./backend/prisma
COPY --from=builder /app/backend/node_modules/.prisma ./backend/node_modules/.prisma
COPY --from=builder /app/backend/node_modules/@prisma ./backend/node_modules/@prisma
COPY --from=builder /app/frontend/dist/browser ./dist
COPY --from=builder /app/landing/dist ./public

# Install only production dependencies for backend
RUN cd backend && npm ci --omit=dev && npm cache clean --force

# Generate Prisma client and run migrations
RUN cd backend && npx prisma generate

# Expose port (Railway uses PORT env var)
EXPOSE $PORT

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:${PORT:-3000}/health || exit 1

# Start the application with Railway's PORT
CMD ["sh", "-c", "cd backend && echo 'Starting deployment...' && (npx prisma migrate deploy || echo 'Migration failed, continuing...') && echo 'Starting server...' && PORT=${PORT:-3000} node dist/server.js"]