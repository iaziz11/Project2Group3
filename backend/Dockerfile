# Use official Node.js image
FROM node:20

# Create app directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the app
COPY . .

# Expose the port (Cloud Run sets $PORT, we just expose it)
EXPOSE 8080

# Start the server
CMD ["npm", "start"]