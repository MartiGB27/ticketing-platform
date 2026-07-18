# ---- Build stage ----
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY tsconfig*.json ./
COPY src ./src
RUN npm run build

# ---- Production stage ----
FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=build /app/dist ./dist

# No EXPOSE: this service never listens on an HTTP port. It only
# connects outbound to RabbitMQ to consume messages.
CMD ["node", "dist/main.js"]
