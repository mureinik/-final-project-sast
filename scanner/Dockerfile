FROM node:26.4.0-alpine

LABEL description="PyScanner — Python SAST Scanner"

WORKDIR /app

COPY package.json ./
COPY scanner.js ./scanner.js
COPY pyscanner.js ./pyscanner.js

ENTRYPOINT ["node", "/app/pyscanner.js"]
