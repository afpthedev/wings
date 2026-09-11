# -----------------------------------------------------------
# Stage 1: Build the Vite Frontend
# -----------------------------------------------------------
FROM node:24-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json .npmrc ./

# Install dependencies
RUN npm ci --legacy-peer-deps

# Copy source files
COPY . .

# Build production bundle to /app/dist
RUN npm run build

# -----------------------------------------------------------
# Stage 2: Minimal Production Runtime
# -----------------------------------------------------------
FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV WORKSPACE_DIR=/app/workspace

# Copy dependency manifests & install only production dependencies
COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev --legacy-peer-deps

# Copy built frontend assets from builder stage
COPY --from=builder /app/dist ./dist

# Copy backend server files
COPY server ./server

# Create workspace directory volume
RUN mkdir -p /app/workspace
VOLUME ["/app/workspace"]

EXPOSE 8080

# Start production server with experimental type stripping
CMD ["node", "--experimental-strip-types", "server/index.ts"]
