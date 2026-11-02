import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CloseExpiredEventsUsecase } from './domain/usecases/closeExpiredEvents.usecase';
import { withSpan } from 'src/common/telemetry';

@Injectable()
export class CloseExpiredEventsScheduler {
  private readonly logger = new Logger(CloseExpiredEventsScheduler.name);

  constructor(private readonly usecase: CloseExpiredEventsUsecase) {}

  @Cron(CronExpression.EVERY_HOUR) // toutes les 1 heures
  async handle() {
    // One trace per run: the queries would otherwise be orphan spans.
    await withSpan('events.close_expired', {}, async () => {
      const count = await this.usecase.execute();
      if (count)
        this.logger.log(
          { event: 'events.closed', 'events.count': count },
          'expired events closed',
        );
    });
  }
}
