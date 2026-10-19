# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Runtime stage
FROM node:22-alpine

# Install FFmpeg and other runtime dependencies
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# /tmp is RAM-backed on Scaleway sandbox v2. Use ephemeral disk instead.
RUN mkdir -p /work/transcoding && chown node:node /work/transcoding

# Environment variables
ENV NODE_ENV=production
ENV PORT=8080
ENV TRANSCODING_WORK_DIR=/work/transcoding
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Run the worker
CMD ["node", "dist/http-worker.js"]
