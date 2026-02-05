# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S mcp -u 1001

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev && npm cache clean --force

# Copy built files
COPY --from=builder /app/dist ./dist

# Set ownership
RUN chown -R mcp:nodejs /app

# Switch to non-root user
USER mcp

# Environment variables with defaults
ENV OPENAPI_SPEC_URL=""
ENV SWAGGER_AUTH_TOKEN=""
ENV CACHE_REFRESH_MINUTES=10
ENV RATE_LIMIT_MAX=60
ENV LOG_LEVEL=info
ENV MCP_SERVER_NAME=knotty
ENV MCP_SERVER_VERSION=1.0.0
ENV NODE_ENV=production

# Health check (optional, for orchestrators)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "console.log('healthy')" || exit 1

# Run the server
ENTRYPOINT ["node", "dist/index.js"]
