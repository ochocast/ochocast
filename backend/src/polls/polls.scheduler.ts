import {
  Injectable,
  Logger,
  OnModuleInit,
  OnApplicationShutdown,
} from '@nestjs/common';
import { PollTimerService } from './infra/services/poll-timer.service';

/**
 * Manages poll lifecycle and timers.
 *
 * Previously used a cron job that ran every 30 seconds, which could cause polls
 * to close up to 60 seconds late (30s + up to 30s until next check).
 *
 * Now uses dynamic timers that fire at the exact moment each poll should expire.
 */
@Injectable()
export class PollsScheduler implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(PollsScheduler.name);

  constructor(private readonly pollTimerService: PollTimerService) {}

  /**
   * Initialize poll timers for all active polls when the application starts.
   * This ensures polls that were created before server restart continue to close on time.
   */
  async onModuleInit(): Promise<void> {
    this.logger.log('🚀 PollsScheduler initializing...');
    await this.pollTimerService.initializeTimersForActivePoll();
  }

  /**
   * Cleanup all poll timers when the application shuts down.
   */
  onApplicationShutdown(): void {
    this.logger.log('🛑 PollsScheduler shutting down...');
    this.pollTimerService.clearAllTimers();
  }
}
