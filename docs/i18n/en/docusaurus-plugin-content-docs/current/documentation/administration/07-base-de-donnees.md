# Database

In this project we use TypeORM to interact with a PostgreSQL database.

When you change a property of an `Entity` (for example `/backend/src/tags/infra/gateways/entities/tag.entity.ts`), it changes the database schema (e.g., adding a `toto` field in the entity will add a `toto` column to the `tag_entity` table).

These changes can be applied automatically by creating and running a migration.

## 1. Generate a migration

After modifying an `Entity`, open a terminal in the `backend/` folder:

To generate a migration, run:
```bash
npm run migration:generate
```

A new migration file is created in `/backend/migrations`. Make sure the SQL statements in the migration match the entity changes.

## 2. Run migrations

To apply migrations:

```bash
npm run migration:run
```

If the command finishes without errors, the changes are applied to the configured database (see `src/config/typeorm.config.ts`).

## 3. Production

In our CI/CD pipeline, migrations run automatically during deployment. Ensure production database configuration and backups are in place before applying critical migrations.

## 4. Troubleshooting

If an error occurs while running migrations, check:
- whether the changes were already applied without the migration
- whether the changes cannot be applied due to constraints (e.g., creating a non-null column without a default value)

### 4.1 Changes already applied

If all migration changes are already present in the database, you can mark the migration as applied in the PostgreSQL migrations table.

To resolve:
- connect to the database and inspect the `migrations` table
- insert a row with the migration identifier (`name`) and the current timestamp (`timestamp`)

Verify the migration has been recorded by re-running `npm run migration:run`.

### 4.2 NULL column issue

Add a default value or remove the NOT NULL constraint from the entity, delete the problematic migration file, then regenerate and run migrations again.
