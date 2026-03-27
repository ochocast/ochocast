# Build stage
FROM golang:1.21-alpine@sha256:2414035b086e3c42b99654c8b26e6f5b1b1598080d65fd03c7f499552ff4dc94 AS builder

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
FROM alpine:3.23@sha256:25109184c71bdad752c8312a8623239686a9a2071e8825f20acb8f2198c3f659

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
