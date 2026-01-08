FROM node:alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
ENV NODE_ENV=production
# Ports: 3000 (HTTP/Admin), 8080 (WS Gateway)
EXPOSE 3000 8080
CMD ["node", "server/server.js"]