FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json ./
COPY core.mjs server.mjs ./
RUN mkdir -p /app/data
ENV PORT=8080
EXPOSE 8080
CMD ["node","server.mjs"]
