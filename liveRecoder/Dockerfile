# Build stage
FROM golang:1.26-alpine@sha256:c2a1f7b2095d046ae14b286b18413a05bb82c9bca9b25fe7ff5efef0f0826166 AS builder

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

# Runtime configuration (see .env.example): RECORDING_SHARED_SECRET,
# BACKEND_PUBLIC_URL and, on an SFU worker, RECORDER_SFU_URL.

# Expose HTTP port
EXPOSE 8080

# Run in HTTP server mode
CMD ["./liveRecorder", "-http", ":8080", "-output", "/var/recordings"]
