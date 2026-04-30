//Create the keycloak module with nest-keycloak-connect i will then import itt in app.module.ts

// Path: backend/src/keycloak.module.ts

import { Module } from '@nestjs/common';
import {
  KeycloakConnectModule,
  AuthGuard,
  RoleGuard,
  PolicyEnforcementMode,
  TokenValidation,
} from 'nest-keycloak-connect';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [
    KeycloakConnectModule.register({
      authServerUrl: process.env.AUTH_SERVER_URL,
      realm: process.env.AUTH_REALM,
      clientId: process.env.AUTH_CLIENT_ID,
      secret: process.env.AUTH_SECRET,
      cookieKey: 'KEYCLOAK_JWT',
      policyEnforcement: PolicyEnforcementMode.PERMISSIVE,
      tokenValidation: TokenValidation.ONLINE,
    }),
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RoleGuard },
  ],
})
export class KeycloakModule {}
