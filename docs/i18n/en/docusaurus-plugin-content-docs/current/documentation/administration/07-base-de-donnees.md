# Database

In this project, we use TypeORM to interact with the PostgreSQL database.

When you change a property of an entity (example file: /backend/src/tags/infra/gateways/entities/tag.entity.ts), this changes the description of the object in the database (for example adding a "toto" field in the entity will add a "toto" column to the tag_entity table).

These changes can be applied automatically by creating and executing a migration.

## 1- Create a migration

After changing the fields in the entity, open a terminal in the /backend/ folder

To generate a migration, use the command "npm run migration:generate"

A new migration has been created in the /backend/migrations folder, you must ensure that the migration changes (in PostgreSQL queries) correspond to the changes that were made in the entity.

## 2- Execute a migration

To execute a migration (and therefore apply changes to the database), in the /backend/ folder, use the command "npm run migration:run".

If there are no error messages, the modifications have been applied to the local database.

## 3- Production Application

Thanks to CI/CD, migrations that have been pushed are automatically executed during production deployment with the same commands as locally

## 4- Troubleshooting

If problems occur during migration execution, there are several points to check:
- have the changes already been applied without the migration?
- are the changes impossible to apply due to constraints (creation of a new column that cannot be NULL and without a default value)

### 4.1- Changes are already applied

If all the migration changes are already in the database, it is possible to directly add the migration to the executed migrations in the PostgreSQL database.

To solve this problem:
- manually connect to the database and check the "migrations" table
- insert into the "migrations" table the following values: the migration identifier (name) and the current timestamp (timestamp)

verify that the migration has been added by relaunching the command "npm run migration:run"

### 4.2- A NULL column causes problems

Add a default value or remove the NOT NULL constraint from the column in the entity, delete the problematic migration file, then restart the migration generation and execution commands.
