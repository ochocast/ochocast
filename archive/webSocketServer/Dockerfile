#Write a dockerfile to run the server.js file in a container
#The docker needs ffmpeg to be installed

FROM node:20.13.1-alpine3.18@sha256:53108f67824964a573ea435fed258f6cee4d88343e9859a99d356883e71b490c

RUN apk update && apk add --no-cache ffmpeg

WORKDIR /websocketserver

COPY package*.json ./

RUN npm install

COPY server.js .

EXPOSE 8081

CMD [ "node", "server.js" ]