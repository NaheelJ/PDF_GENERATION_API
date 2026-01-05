# Use stable Node LTS (IMPORTANT)
FROM node:18-slim

# App directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (production only)
RUN npm install --production

# Copy source code
COPY . .

# Cloud Run uses PORT env variable
ENV PORT=8080

# Expose port
EXPOSE 8080

# Start server
CMD ["npm", "start"]
