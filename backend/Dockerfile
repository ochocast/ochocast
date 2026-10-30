# Stage 1: Build stage
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies)
RUN npm ci

# Copy source code
COPY . .

# Build the project
RUN npm run build

# Stage 2: Production stage
FROM node:20-alpine

ENV NODE_ENV=production

WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy built assets from builder stage
COPY --from=builder /usr/src/app/dist ./dist

# Run as the image's unprivileged "node" user (uid 1000). It listens on PORT (8080 in the
# deployment templates), so no privileged port is needed.
USER node
EXPOSE 8080/tcp

# Run compiled migrations and then start the app
CMD ["sh", "-c", "npm run migration:run:prod && node dist/main.js"]
