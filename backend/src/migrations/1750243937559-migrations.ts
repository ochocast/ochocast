import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
} from 'typeorm';

export class Migrations1750243937559 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'user_favorite_videos',
        columns: [
          {
            name: 'user_id',
            type: 'uuid',
            isPrimary: true,
          },
          {
            name: 'video_id',
            type: 'uuid',
            isPrimary: true,
          },
        ],
      }),
    );

    await queryRunner.createForeignKey(
      'user_favorite_videos',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedTableName: 'user_entity',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'user_favorite_videos',
      new TableForeignKey({
        columnNames: ['video_id'],
        referencedTableName: 'video_entity',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('user_favorite_videos');
  }
}
