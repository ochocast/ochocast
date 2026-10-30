import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { secretMatches } from 'src/common/secret-matches';

/**
 * Validates the X-Sfu-Webhook-Secret header against SFU_WEBHOOK_SECRET env var.
 * Used on the endpoint that must only be callable by the SFU (live events).
 */
@Injectable()
export class SfuWebhookGuard implements CanActivate {
  private readonly secret: string | undefined;

  constructor() {
    this.secret = process.env.SFU_WEBHOOK_SECRET;
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.secret) {
      throw new UnauthorizedException('SFU_WEBHOOK_SECRET is not configured');
    }
    const request = context.switchToHttp().getRequest();
    if (!secretMatches(this.secret, request.headers['x-sfu-webhook-secret'])) {
      throw new UnauthorizedException('Invalid or missing SFU webhook secret');
    }
    return true;
  }
}
