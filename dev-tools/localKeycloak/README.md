## Getting Started

To get started, run the following command to start the Docker container:

```bash
docker-compose up -d
```

The deployent is the same in local and in public.

Once the container is running, you can connect to Keycloak by visiting http://localhost:8080 in your web browser.

## Auto Import Local Config

Normally, the local realm is imported automatically via docker-compose.
But there is no user.
So go to the next part until "Creating a User".

/!\ If not the next part is for settup it manually /!\

## Creating a Realm

To use Keycloak, you'll need to create a new realm. To do this, follow these steps:

1. Log in to the Keycloak admin console at http://localhost:8080.
2. Click on the "Add Realm" button and give your new realm the name local-realm.
3. Click on the "Create" button to create the new realm.

## Configuring the ochocast Client

To configure the ochocast client, follow these steps:

1. In the Keycloak admin console, select your new realm from the dropdown menu.
2. Click on the "Clients" tab and then click on the "Create" button.
3. Give your new client the name ochocast.
4. Under "Valid Redirect URIs", add `http://localhost:3000/events/` and `http://localhost:3000/*` (order matters).
5. Under "Root URL", add `http://localhost:3000`.
6. Under "Home Origins", add `http://localhost:3000`.
7. Under "Web Origins", add `http://localhost:3000`.
8. Click on the "Save" button to save your changes.

## Configuring the Nest-Back Client

To configure the Nest-Back client, follow these steps:

1. In the Keycloak admin console, select your new realm from the dropdown menu.
2. Click on the "Clients" tab and then click on the "Create" button.
3. Give your new client a name (e.g. "nest-back").
4. Enable Client Auth.
5. Under "Authorization Enabled", select "On".
6. Under "Flow ", select "Implicit Flow" and set to "off" Standard flow.
7. Under "Root URL" and "Home URL", add `http://localhost:3001`.
8. Click on the "Save" button to save your changes.
9. Click on the "Credentials" tab of the client, copy the secret and paste it in yout .env file under "AUTH_SECRET" of the backend.

## Creating a User

To create a user, follow these steps:

1. In the Keycloak admin console, select your new realm from the dropdown menu.
2. Click on the "Users" tab and then click on the "Add User" button.
3. Enter the user's details (e.g. username, Email, first, last name).
4. Click on the "Save" button to save your changes.
5. Click on the "Credentials" tab of the client, modify the password.
