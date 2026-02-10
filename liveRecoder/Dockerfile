# Build stage
FROM golang:1.21-alpine AS builder

WORKDIR /app

# Install dependencies
RUN apk add --no-cache git

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY *.go ./

# Build the binary
RUN CGO_ENABLED=0 GOOS=linux go build -o liveRecorder .

# Runtime stage
FROM alpine:3.19

WORKDIR /app

# Install CA certificates for HTTPS calls
RUN apk add --no-cache ca-certificates

# Copy binary from builder
COPY --from=builder /app/liveRecorder .

# Create recordings directory
RUN mkdir -p /var/recordings

# Environment variables for recording
ENV OUTPUT_DIR=/var/recordings
ENV HTTP_PORT=8080

# Environment variables for auto-publish (set these in production)
# ENV BACKEND_PUBLIC_URL=https://api.example.com
# ENV KEYCLOAK_TOKEN_URL=https://keycloak.example.com/realms/xxx/protocol/openid-connect/token
# ENV KEYCLOAK_CLIENT_ID=nest-back
# ENV KEYCLOAK_CLIENT_SECRET=your-secret
# ENV RECORDING_USER_USERNAME=recorder
# ENV RECORDING_USER_PASSWORD=your-password

# Expose HTTP port
EXPOSE 8080

# Run in HTTP server mode
CMD ["./liveRecorder", "-http", ":8080", "-output", "/var/recordings"]
