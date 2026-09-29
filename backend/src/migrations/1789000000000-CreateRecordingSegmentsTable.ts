import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateRecordingSegmentsTable1789000000000 implements MigrationInterface {
  name = 'CreateRecordingSegmentsTable1789000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'recording_entity',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          { name: 'trackId', type: 'uuid', isNullable: false },
          { name: 'media_id', type: 'varchar', isNullable: false },
          {
            name: 'visibility',
            type: 'varchar',
            default: "'unlisted'",
            isNullable: false,
          },
          {
            name: 'problematic',
            type: 'boolean',
            default: false,
            isNullable: false,
          },
          {
            name: 'segment_index',
            type: 'integer',
            default: 0,
            isNullable: false,
          },
          { name: 'duration', type: 'float', isNullable: true },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'recording_entity',
      new TableIndex({
        name: 'IDX_recording_track',
        columnNames: ['trackId'],
      }),
    );

    await queryRunner.createForeignKey(
      'recording_entity',
      new TableForeignKey({
        columnNames: ['trackId'],
        referencedTableName: 'track_entity',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('recording_entity');
    if (table) {
      const fk = table.foreignKeys.find((f) =>
        f.columnNames.includes('trackId'),
      );
      if (fk) await queryRunner.dropForeignKey('recording_entity', fk);
      await queryRunner.dropIndex('recording_entity', 'IDX_recording_track');
    }
    await queryRunner.dropTable('recording_entity');
  }
}
