#Write a dockerfile to run the server.js file in a container
#The docker needs ffmpeg to be installed

FROM node:22.2.0-alpine3.18@sha256:a46d9fcb38cae53de45b35b90f6df232342242bebc9323a417416eb67942979e

RUN apk update && apk add --no-cache ffmpeg

WORKDIR /websocketserver

COPY package*.json ./

RUN npm install

COPY server.js .

EXPOSE 8081

CMD [ "node", "server.js" ]