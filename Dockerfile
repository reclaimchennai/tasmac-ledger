# Single image, two roles (site / watch) selected by docker-compose `command:`.
# better-sqlite3 tries its prebuilt binary first but still falls back to
# node-gyp when the fetch fails (no outbound access during build here), so
# the toolchain is required, not optional.
FROM node:24-bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Build artefacts default to .next (see next.config.mjs); the container never
# runs `next dev`, so there's no clash with a host-side dev build in .next-dev.
ENV NODE_ENV=production
RUN npm run build

EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000", "-H", "0.0.0.0"]
