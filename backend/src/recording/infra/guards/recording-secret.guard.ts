import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

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
    const header = request.headers['x-recording-secret'] as string | undefined;
    if (!header || header !== this.secret) {
      throw new UnauthorizedException('Invalid or missing recording secret');
    }
    return true;
  }
}
