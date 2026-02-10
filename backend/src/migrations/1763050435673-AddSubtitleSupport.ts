import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddSubtitleSupport1763050435673 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'video_entity',
      new TableColumn({
        name: 'subtitle_id',
        type: 'varchar',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('video_entity', 'subtitle_id');
  }
}
