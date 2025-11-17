# Stage 1: Build the React app
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build arguments for React environment variables
ARG REACT_APP_API_URL
ARG REACT_APP_API_PORT
ARG REACT_APP_AUTHORIZATION_ENDPOINT
ARG REACT_APP_CLIENT_ID
ARG REACT_APP_REDIRECT_URI
ARG REACT_APP_STREAM_URL
ARG REACT_APP_SERVER_IP

# Set environment variables for the build
ENV REACT_APP_API_URL=$REACT_APP_API_URL
ENV REACT_APP_API_PORT=$REACT_APP_API_PORT
ENV REACT_APP_AUTHORIZATION_ENDPOINT=$REACT_APP_AUTHORIZATION_ENDPOINT
ENV REACT_APP_CLIENT_ID=$REACT_APP_CLIENT_ID
ENV REACT_APP_REDIRECT_URI=$REACT_APP_REDIRECT_URI
ENV REACT_APP_STREAM_URL=$REACT_APP_STREAM_URL
ENV REACT_APP_SERVER_IP=$REACT_APP_SERVER_IP

# Build the app
RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:alpine

# Copy built assets from builder stage
COPY --from=builder /app/build /usr/share/nginx/html

# Copy nginx configuration if needed (optional)
# COPY nginx.conf /etc/nginx/nginx.conf

# Expose port 80
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
