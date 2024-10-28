FROM node:20-alpine

WORKDIR /usr/src/app

COPY package*.json  ./

RUN npm ci

COPY . .

RUN npm run build

EXPOSE 3001/tcp

CMD npm run migration:run && node dist/main.js
