# Stage 1: Build React + Vite Frontend
FROM node:22-bookworm-slim AS frontend-builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html tsconfig.json tailwind.config.js postcss.config.js vite.config.ts ./
COPY src ./src
RUN npm run build

# Stage 2: Build Hardened Rust Axum Backend
FROM rust:latest AS rust-builder
WORKDIR /app/backend
COPY backend/Cargo.toml ./
RUN mkdir src && echo "fn main() {}" > src/main.rs && cargo build --release || true
COPY backend/src ./src
COPY backend/tests ./tests
RUN cargo build --release --locked || cargo build --release

# Stage 3: Minimal Hardened Production Runtime + Open-Source Engine Suite
FROM debian:bookworm-slim AS runtime
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    ffmpeg \
    libreoffice-writer \
    libreoffice-calc \
    libreoffice-impress \
    pandoc \
    imagemagick \
    inkscape \
    calibre \
    p7zip-full \
    woff2 \
    assimp-utils \
    python3-fonttools \
    && rm -rf /var/lib/apt/lists/*

# Harden ImageMagick policy against ImageTragick/arbitrary coder execution
RUN if [ -f /etc/ImageMagick-6/policy.xml ]; then \
      sed -i 's/rights="read|write" pattern="EPHEMERAL"/rights="none" pattern="EPHEMERAL"/g' /etc/ImageMagick-6/policy.xml && \
      sed -i 's/rights="read|write" pattern="URL"/rights="none" pattern="URL"/g' /etc/ImageMagick-6/policy.xml && \
      sed -i 's/rights="read|write" pattern="HTTPS"/rights="none" pattern="HTTPS"/g' /etc/ImageMagick-6/policy.xml && \
      sed -i 's/rights="read|write" pattern="MVG"/rights="none" pattern="MVG"/g' /etc/ImageMagick-6/policy.xml && \
      sed -i 's/rights="read|write" pattern="MSL"/rights="none" pattern="MSL"/g' /etc/ImageMagick-6/policy.xml; \
    fi

RUN useradd --create-home --shell /usr/sbin/nologin omnimorph
WORKDIR /app

COPY --from=rust-builder /app/backend/target/release/omnimorph-backend /app/omnimorph-backend
COPY --from=frontend-builder /app/dist /app/dist

RUN mkdir -p /tmp/omnimorph_jobs && chown -R omnimorph:omnimorph /app /tmp/omnimorph_jobs
USER omnimorph

ENV OMNIMORPH_LISTEN=0.0.0.0:8080
ENV OMNIMORPH_STATIC_DIR=/app/dist
ENV OMNIMORPH_WORK_DIR=/tmp/omnimorph_jobs
ENV OMNIMORPH_SANDBOX_MODE=process_isolated

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD ["/bin/sh", "-c", "exec 3<>/dev/tcp/127.0.0.1/8080"]

CMD ["/app/omnimorph-backend"]
