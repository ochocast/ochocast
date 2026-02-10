# Migrations tutorial

## 1 - modify the fields of an entity (here we take user_entity as an example)

for example, add a field
    @Column({
    nullable: true
    })
    description: string;

## 2 - generate a migration

(in ./backend/ )
npm run migration:generate

A new migration was created, check that the migration fits what you changed

## 3 - Run the migration

(in ./backend/ )

npm run migration:run

