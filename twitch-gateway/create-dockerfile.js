const fs = require('fs');

const dockerfileContent = `
FROM node:alpine

WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build frontend (optional, if you want to serve it from express)
RUN npm run build:client

# Expose ports
EXPOSE 3000
EXPOSE 8080

# Start command is defined in docker-compose
CMD ["npm", "start"]
`;

fs.writeFileSync('Dockerfile', dockerfileContent.trim());
console.log('Dockerfile created successfully.');
