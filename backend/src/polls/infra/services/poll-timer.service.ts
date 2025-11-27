import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PollEntity } from '../gateways/entities/poll.entity';
import { ChatGateway } from 'src/chat/chat.gateway';

/**
 * Service responsible for managing poll timers dynamically.
 * Instead of using a cron that checks every 30s, this service maintains
 * a Map of timeouts that trigger at the exact time each poll should expire.
 */
@Injectable()
export class PollTimerService {
  private readonly logger = new Logger(PollTimerService.name);
  private readonly pollTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    @InjectRepository(PollEntity)
    private readonly pollRepository: Repository<PollEntity>,
    private readonly chatGateway: ChatGateway,
  ) {}

  /**
   * Schedule a poll to close at the exact time it should expire.
   * Called when a poll is created.
   */
  schedulePollClose(pollId: string, durationSeconds: number): void {
    // Clear any existing timer for this poll
    this.cancelPollTimer(pollId);

    const delayMs = durationSeconds * 1000;

    this.logger.log(
      `⏱️ Scheduled poll ${pollId} to close in ${durationSeconds}s (${delayMs}ms)`,
    );

    const timeout = setTimeout(async () => {
      await this.closePollByTimer(pollId);
    }, delayMs);

    this.pollTimers.set(pollId, timeout);
  }

  /**
   * Initialize timers for all active polls at server startup.
   * This ensures polls that were active before a server restart continue to close on time.
   */
  async initializeTimersForActivePoll(): Promise<void> {
    try {
      const activePolis = await this.pollRepository.find({
        where: { status: 'active' },
      });

      this.logger.log(
        `🔧 Initializing timers for ${activePolis.length} active polls at startup`,
      );

      for (const poll of activePolis) {
        const createdAt = new Date(poll.createdAt).getTime();
        const durationMs = poll.duration * 1000;
        const pollEndTime = createdAt + durationMs;
        const now = Date.now();
        const remainingMs = pollEndTime - now;

        if (remainingMs > 0) {
          const remainingSeconds = Math.ceil(remainingMs / 1000);
          this.logger.log(
            `⏱️ Poll ${poll.id}: ${remainingSeconds}s remaining, scheduling auto-close`,
          );
          this.schedulePollClose(poll.id, remainingSeconds);
        } else {
          // Poll should have already closed
          this.logger.log(
            `⏰ Poll ${poll.id}: Duration expired, closing immediately`,
          );
          await this.closePollByTimer(poll.id);
        }
      }
    } catch (error) {
      this.logger.error(
        'Error initializing poll timers at startup',
        error instanceof Error ? error.message : error,
      );
    }
  }

  /**
   * Close a poll by timer expiration and broadcast to all connected clients.
   */
  private async closePollByTimer(pollId: string): Promise<void> {
    try {
      const poll = await this.pollRepository.findOne({
        where: { id: pollId },
      });

      if (!poll) {
        this.logger.warn(`Poll ${pollId} not found when closing by timer`);
        return;
      }

      if (poll.status !== 'active') {
        this.logger.log(
          `Poll ${pollId} is already ${poll.status}, skipping close`,
        );
        this.pollTimers.delete(pollId);
        return;
      }

      poll.status = 'closed';
      await this.pollRepository.save(poll);

      this.logger.log(`✓ Poll ${pollId} auto-closed by timer`);

      // Broadcast poll closure to all connected clients via WebSocket
      this.chatGateway.broadcastPollClosed(poll.trackId, pollId);

      // Clean up the timer
      this.pollTimers.delete(pollId);
    } catch (error) {
      this.logger.error(
        `Error closing poll ${pollId} by timer`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  /**
   * Cancel the timer for a poll (e.g., when it's manually closed).
   */
  cancelPollTimer(pollId: string): void {
    const timeout = this.pollTimers.get(pollId);
    if (timeout) {
      clearTimeout(timeout);
      this.pollTimers.delete(pollId);
      this.logger.log(`✓ Cancelled timer for poll ${pollId}`);
    }
  }

  /**
   * Get the number of active timers (useful for monitoring).
   */
  getActiveTimersCount(): number {
    return this.pollTimers.size;
  }

  /**
   * Cleanup all timers (useful on application shutdown).
   */
  clearAllTimers(): void {
    this.logger.log(`🧹 Clearing ${this.pollTimers.size} poll timers`);
    this.pollTimers.forEach((timeout) => clearTimeout(timeout));
    this.pollTimers.clear();
  }
}
