# ── Build client ─────────────────────────────────────────────
FROM node:20-alpine AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ── Server ───────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# Server dependencies
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

# Copy server source
COPY server/ ./server/

# Copy built client
COPY --from=client-build /app/client/build ./client/build

# Serve static files from server
RUN sed -i 's|// ── Start|app.use(express.static(path.join(__dirname, "../client/build")));\napp.get("*", (_, res) => res.sendFile(path.join(__dirname, "../client/build/index.html")));\n// ── Start|' /app/server/server.js 2>/dev/null || true

WORKDIR /app/server
EXPOSE 4000

VOLUME ["/app/server/data"]

CMD ["node", "server.js"]
