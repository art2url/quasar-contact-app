# Multi-stage Docker build
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY frontend/package*.json ./frontend/
COPY backend/package*.json ./backend/

# Install dependencies
RUN npm install
RUN cd frontend && npm install
RUN cd backend && npm install

# Copy source code
COPY . .

# Build the application with environment variables
# These will be replaced at build time with actual values
ARG NG_APP_API_URL
ARG NG_APP_WS_URL
ARG NODE_ENV=production

ENV NG_APP_API_URL=$NG_APP_API_URL
ENV NG_APP_WS_URL=$NG_APP_WS_URL
ENV NODE_ENV=$NODE_ENV

# Build frontend and backend
RUN npm run build

# Production stage
FROM node:18-alpine AS production

WORKDIR /app

# Copy only production files
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/package*.json ./backend/
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

# Install only production dependencies
RUN cd backend && npm ci --only=production

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start the application
CMD ["node", "backend/dist/server.js"]