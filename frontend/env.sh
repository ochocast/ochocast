#!/bin/sh

# Line-by-line construction of the JS file
echo "window._env_ = {" > /usr/share/nginx/html/env-config.js
echo "  \"REACT_APP_API_URL\": \"$REACT_APP_API_URL\"," >> /usr/share/nginx/html/env-config.js
echo "  \"REACT_APP_API_PORT\": \"$REACT_APP_API_PORT\"," >> /usr/share/nginx/html/env-config.js
echo "  \"REACT_APP_AUTHORIZATION_ENDPOINT\": \"$REACT_APP_AUTHORIZATION_ENDPOINT\"," >> /usr/share/nginx/html/env-config.js
echo "  \"REACT_APP_CLIENT_ID\": \"$REACT_APP_CLIENT_ID\"," >> /usr/share/nginx/html/env-config.js
echo "  \"REACT_APP_REDIRECT_URI\": \"$REACT_APP_REDIRECT_URI\"," >> /usr/share/nginx/html/env-config.js
echo "  \"REACT_APP_SFU_CONTROL_PLANE_URL\": \"$REACT_APP_SFU_CONTROL_PLANE_URL\"" >> /usr/share/nginx/html/env-config.js
echo "};" >> /usr/share/nginx/html/env-config.js

exec "$@"
