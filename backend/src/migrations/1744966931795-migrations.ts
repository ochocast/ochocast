import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class Migrations1744966931795 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('event_entity', 'category');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'event_entity',
      new TableColumn({
        name: 'category',
        type: 'varchar',
        isNullable: false, // ou true si c’était nullable
      }),
    );
  }
}
