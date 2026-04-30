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

const resolveTokenValidation = (): TokenValidation => {
  const tokenValidation = process.env.KEYCLOAK_TOKEN_VALIDATION?.toUpperCase();

  if (tokenValidation === 'OFFLINE') {
    return TokenValidation.OFFLINE;
  }

  if (tokenValidation === 'NONE') {
    return TokenValidation.NONE;
  }

  return TokenValidation.ONLINE;
};

@Module({
  imports: [
    KeycloakConnectModule.register({
      authServerUrl: process.env.AUTH_SERVER_URL,
      realm: process.env.AUTH_REALM,
      clientId: process.env.AUTH_CLIENT_ID,
      secret: process.env.AUTH_SECRET,
      cookieKey: 'KEYCLOAK_JWT',
      policyEnforcement: PolicyEnforcementMode.PERMISSIVE,
      tokenValidation: resolveTokenValidation(),
    }),
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RoleGuard },
  ],
})
export class KeycloakModule {}
