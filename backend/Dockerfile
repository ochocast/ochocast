FROM node:20-alpine as build

WORKDIR /usr/src/app

COPY package*.json  ./

RUN npm ci

COPY . .

RUN npm run build


FROM node:20-alpine as prod

WORKDIR /usr/src/app

COPY --from=build /usr/src/app/dist ./dist

RUN npm i -g typeorm

EXPOSE 80/tcp

CMD npx typeorm migration:run -d dist/config/typeorm.config.js && node dist/main.js
