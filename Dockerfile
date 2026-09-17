FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY server.mjs ./
COPY public ./public
COPY source-data.json ./source-data.json
ENV PORT=3187
EXPOSE 3187
CMD ["node", "server.mjs"]
