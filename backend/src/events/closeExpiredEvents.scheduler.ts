import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CloseExpiredEventsUsecase } from './domain/usecases/closeExpiredEvents.usecase';

@Injectable()
export class CloseExpiredEventsScheduler {
  private readonly logger = new Logger(CloseExpiredEventsScheduler.name);

  constructor(private readonly usecase: CloseExpiredEventsUsecase) {}

  @Cron(CronExpression.EVERY_HOUR) // toutes les 1 heures
  async handle() {
    console.log('Fermeture des événements expirés...');
    const count = await this.usecase.execute();
    if (count) this.logger.log(`${count} event(s) auto-fermés`);
  }
}
