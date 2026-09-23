FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY core.mjs server.mjs ./
RUN mkdir -p /app/data
ENV PORT=3191
EXPOSE 3191
CMD ["node","server.mjs"]
