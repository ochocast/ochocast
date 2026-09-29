import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

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
    const header = request.headers['x-sfu-webhook-secret'] as
      | string
      | undefined;
    if (
      !header ||
      header.length !== this.secret.length ||
      !timingSafeEqual(Buffer.from(header), Buffer.from(this.secret))
    ) {
      throw new UnauthorizedException('Invalid or missing SFU webhook secret');
    }
    return true;
  }
}
