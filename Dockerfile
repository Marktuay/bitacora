FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY api ./api
COPY lib ./lib
COPY scripts ./scripts
COPY assets ./assets
COPY *.html manifest.webmanifest sw.js ./
RUN npm run build
ENV NODE_ENV=production PORT=4173
USER node
EXPOSE 4173
CMD ["npm", "start"]
