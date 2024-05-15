# Pour faire des migrations 

## 1 - modifier le code d'une entity (par exemple user_entity)

exemple ajouter un champ 
    @Column({
    nullable: true
    })
    description: string;

## 2 - generer une migration

(dans ./backend/ )
npm run migration:generate

Dans le dossier migration, une nouvelle migration devrait avoir ete cree, verifier que la migration correspond au besoin

## 3 - Executer la migration

(dans ./backend/ )

npm run migration:run

