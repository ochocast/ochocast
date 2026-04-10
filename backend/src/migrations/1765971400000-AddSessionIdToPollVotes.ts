import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddSessionIdToPollVotes1765971400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.changeColumn(
      'poll_votes',
      'userId',
      new TableColumn({
        name: 'userId',
        type: 'uuid',
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      'poll_votes',
      new TableColumn({
        name: 'sessionId',
        type: 'varchar',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('poll_votes', 'sessionId');

    await queryRunner.changeColumn(
      'poll_votes',
      'userId',
      new TableColumn({
        name: 'userId',
        type: 'uuid',
        isNullable: false,
      }),
    );
  }
}
