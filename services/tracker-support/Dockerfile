FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends python3 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json core.mjs server.mjs sde-catalog.mjs sde_import.py ./
RUN mkdir -p /app/data

ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.mjs"]
