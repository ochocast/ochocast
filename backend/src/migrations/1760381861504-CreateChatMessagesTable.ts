import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableIndex,
  TableForeignKey,
} from 'typeorm';

export class CreateChatMessagesTable1760381861504 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'chat_messages',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'message',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'userId',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'username',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'trackId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'timestamp',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
        ],
        indices: [
          new TableIndex({
            name: 'IDX_CHAT_MESSAGES_TRACK_ID',
            columnNames: ['trackId'],
          }),
          new TableIndex({
            name: 'IDX_CHAT_MESSAGES_TIMESTAMP',
            columnNames: ['timestamp'],
          }),
        ],
      }),
      true,
    );

    // Add foreign key constraint to track table
    await queryRunner.createForeignKey(
      'chat_messages',
      new TableForeignKey({
        columnNames: ['trackId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'track_entity',
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('chat_messages');
  }
}
