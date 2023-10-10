```bash
docker-compose up -d

docker exec local_keycloak \
    /opt/jboss/keycloak/bin/add-user-keycloak.sh \
    -u admin \
    -p admin \
&& docker restart local_keycloak
```
Connect to http://localhost:28080/auth/admin/ and create a new realm named `local-realm` with a client named `octocast` and a user with whatever credentiials you want.

## Keycloak client configuration

### Client settings

- Valid Redirect URIs: `http://localhost:3000/loading`
- Base URL: `http://localhost:3000`
- Web Origins: `http://localhost:3000`