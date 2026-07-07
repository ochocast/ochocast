# Build stage
FROM node:22-alpine AS builder

# Install FFmpeg
RUN apk add --no-cache ffmpeg

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

# Create temp directory for transcoding
RUN mkdir -p /tmp/transcoding && chmod 777 /tmp/transcoding

# Environment variables
ENV NODE_ENV=production
ENV WORKER_CONCURRENCY=1

# Run the worker
CMD ["node", "dist/worker.js"]
