# Use latest Node.js image
FROM node:alpine

# Create app directory
WORKDIR /app

# Install server dependencies directly
WORKDIR /app/server
RUN npm install @google/genai cors dotenv express mongoose ws

# Return to root
WORKDIR /app

# Copy the rest of the application code
COPY . .

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3001
ENV DEV=false

# Expose the API/WS port
EXPOSE 3001

# Start the server
CMD ["node", "server/server.js"]