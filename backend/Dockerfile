FROM node:20-alpine AS builder

RUN npm install -g pnpm@10.14.0

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src

RUN pnpm run build

FROM node:20-alpine AS production

RUN npm install -g pnpm@10.14.0

WORKDIR /app

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --prod --frozen-lockfile && \
    pnpm store prune


COPY --from=builder /app/dist ./dist

RUN chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3001

CMD ["node", "dist/index.js"]

