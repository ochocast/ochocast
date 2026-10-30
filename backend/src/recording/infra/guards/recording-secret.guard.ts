import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { secretMatches } from 'src/common/secret-matches';

/**
 * Validates the X-Recording-Secret header against RECORDING_SHARED_SECRET env var.
 * Used on recording endpoints that must only be callable by the liveRecorder service.
 */
@Injectable()
export class RecordingSecretGuard implements CanActivate {
  private readonly secret: string | undefined;

  constructor() {
    this.secret = process.env.RECORDING_SHARED_SECRET;
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.secret) {
      throw new UnauthorizedException(
        'RECORDING_SHARED_SECRET is not configured',
      );
    }
    const request = context.switchToHttp().getRequest();
    if (!secretMatches(this.secret, request.headers['x-recording-secret'])) {
      throw new UnauthorizedException('Invalid or missing recording secret');
    }
    return true;
  }
}
