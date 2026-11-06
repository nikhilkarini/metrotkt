# Use official Node.js LTS image
FROM node:20-bookworm-slim

# Install system dependencies required for native modules (better-sqlite3)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy application source code
COPY . .

# Set default production environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose standard port
EXPOSE 3000

# Start server
CMD ["node", "server.js"]
