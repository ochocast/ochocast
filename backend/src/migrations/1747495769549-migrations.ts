import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
} from 'typeorm';

export class Migrations1747495769549 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'track_entity_speakers_user_entity',
        columns: [
          {
            name: 'trackEntityId',
            type: 'uuid',
            isPrimary: true,
          },
          {
            name: 'userEntityId',
            type: 'uuid',
            isPrimary: true,
          },
        ],
      }),
    );

    await queryRunner.createForeignKey(
      'track_entity_speakers_user_entity',
      new TableForeignKey({
        columnNames: ['trackEntityId'],
        referencedTableName: 'track_entity',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'track_entity_speakers_user_entity',
      new TableForeignKey({
        columnNames: ['userEntityId'],
        referencedTableName: 'user_entity',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('track_entity_speakers_user_entity');
  }
}
