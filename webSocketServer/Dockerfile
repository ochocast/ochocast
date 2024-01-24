#Write a dockerfile to run the server.js file in a container
#The docker needs ffmpeg to be installed

FROM node:20.3.0-alpine3.18

RUN apk update && apk add --no-cache ffmpeg

WORKDIR /websocketserver

COPY package*.json ./

RUN npm install

COPY server.js .

EXPOSE 8081

CMD [ "node", "server.js" ]