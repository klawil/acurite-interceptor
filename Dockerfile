# Basic node server in production mode
FROM node:12.20.0
ENV NODE_ENV=production

# Move working directory to allow relative file paths
WORKDIR /app

# Copy package information and install dependencies
COPY ["package.json", "package-lock.json*", "./"]
RUN npm install --production

# Copy source code into the image
COPY . .

# Execute the server.js file
CMD [ "node", "server.js" ]
