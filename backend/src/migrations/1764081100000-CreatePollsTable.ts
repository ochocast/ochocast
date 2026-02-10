import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableIndex,
  TableForeignKey,
} from 'typeorm';

export class CreatePollsTable1764081100000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create polls table
    await queryRunner.createTable(
      new Table({
        name: 'polls',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'question',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'responses',
            type: 'text',
            isArray: true,
            isNullable: false,
          },
          {
            name: 'status',
            type: 'varchar',
            default: "'active'",
            isNullable: false,
          },
          {
            name: 'duration',
            type: 'integer',
            isNullable: false,
          },
          {
            name: 'trackId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'createdById',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
        ],
      }),
    );

    // Add indexes
    await queryRunner.createIndex(
      'polls',
      new TableIndex({
        name: 'IDX_polls_trackId',
        columnNames: ['trackId'],
      }),
    );

    await queryRunner.createIndex(
      'polls',
      new TableIndex({
        name: 'IDX_polls_status',
        columnNames: ['status'],
      }),
    );

    // Add foreign key for track
    await queryRunner.createForeignKey(
      'polls',
      new TableForeignKey({
        columnNames: ['trackId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'track_entity',
        onDelete: 'CASCADE',
      }),
    );

    // Add foreign key for user
    await queryRunner.createForeignKey(
      'polls',
      new TableForeignKey({
        columnNames: ['createdById'],
        referencedColumnNames: ['id'],
        referencedTableName: 'user_entity',
        onDelete: 'SET NULL',
      }),
    );

    // Create poll_votes table
    await queryRunner.createTable(
      new Table({
        name: 'poll_votes',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'pollId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'responseIndex',
            type: 'integer',
            isNullable: false,
          },
          {
            name: 'userId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
        ],
      }),
    );

    // Add indexes for poll_votes
    await queryRunner.createIndex(
      'poll_votes',
      new TableIndex({
        name: 'IDX_poll_votes_pollId',
        columnNames: ['pollId'],
      }),
    );

    await queryRunner.createIndex(
      'poll_votes',
      new TableIndex({
        name: 'IDX_poll_votes_userId',
        columnNames: ['userId'],
      }),
    );

    // Unique constraint on pollId + userId
    await queryRunner.createIndex(
      'poll_votes',
      new TableIndex({
        name: 'UQ_poll_votes_poll_user',
        columnNames: ['pollId', 'userId'],
        isUnique: true,
      }),
    );

    // Add foreign keys for poll_votes
    await queryRunner.createForeignKey(
      'poll_votes',
      new TableForeignKey({
        columnNames: ['pollId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'polls',
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'poll_votes',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'user_entity',
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop poll_votes first due to foreign key constraints
    await queryRunner.dropTable('poll_votes', true);
    // Drop polls table
    await queryRunner.dropTable('polls', true);
  }
}
