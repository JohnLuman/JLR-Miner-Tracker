FROM node:22-alpine
WORKDIR /app
# The Alpine image contains no TrueType fonts. Without these, the SVG PNG
# renderer drew the neon background but no ship names or numbers.
RUN apk add --no-cache fontconfig font-dejavu && fc-cache -f
COPY package.json ./
# Install the native PNG/SVG renderer inside the production image. Railway's
# Docker builds do not execute the npm commands from service build settings.
RUN npm install --omit=dev --no-audit --no-fund
COPY server.mjs ./
COPY lib ./lib
COPY public ./public
COPY source-data.json ./source-data.json
ENV PORT=3187
EXPOSE 3187
CMD ["node", "server.mjs"]
