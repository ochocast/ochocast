import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class AddChatMessageEditsAndReactions1733676000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add editedAt column to chat_messages table
    await queryRunner.query(`
      ALTER TABLE chat_messages
      ADD COLUMN IF NOT EXISTS "editedAt" TIMESTAMP NULL
    `);

    // Create message_reactions table
    await queryRunner.createTable(
      new Table({
        name: 'message_reactions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'emoji',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'userId',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'messageId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
        indices: [
          new TableIndex({
            name: 'IDX_MESSAGE_REACTIONS_MESSAGE_ID',
            columnNames: ['messageId'],
          }),
        ],
        uniques: [
          {
            name: 'UQ_MESSAGE_REACTIONS_USER_MESSAGE_EMOJI',
            columnNames: ['messageId', 'userId', 'emoji'],
          },
        ],
      }),
      true,
    );

    // Add foreign key constraint to chat_messages table
    await queryRunner.createForeignKey(
      'message_reactions',
      new TableForeignKey({
        columnNames: ['messageId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'chat_messages',
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign key
    const table = await queryRunner.getTable('message_reactions');
    if (table) {
      const foreignKey = table.foreignKeys.find(
        (fk) => fk.columnNames.indexOf('messageId') !== -1,
      );
      if (foreignKey) {
        await queryRunner.dropForeignKey('message_reactions', foreignKey);
      }
    }

    // Drop message_reactions table
    await queryRunner.dropTable('message_reactions', true);

    // Remove editedAt column from chat_messages
    await queryRunner.query(`
      ALTER TABLE chat_messages
      DROP COLUMN IF EXISTS "editedAt"
    `);
  }
}
