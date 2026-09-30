FROM node:24-alpine AS build
ENV NODE_OPTIONS=--dns-result-order=ipv4first
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma
COPY server ./server
RUN npm run prisma:generate && npm run build && npm prune --omit=dev
FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node database ./database
COPY --chown=node:node tests ./tests
USER node
EXPOSE 3001
CMD ["node", "dist/main.js"]
