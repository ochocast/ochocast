FROM node:20-alpine as build

WORKDIR /usr/src/app

COPY package*.json  ./

RUN npm ci

COPY . .

RUN npm run build


FROM node:20-alpine as prod

WORKDIR /usr/src/app

COPY --from=build /usr/src/app/dist ./dist

EXPOSE 80/tcp

CMD npx typeorm migration:run && node dist/main.js
