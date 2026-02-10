# Back-End

## Introduction
This document describes the backend organization following a diamond architecture. This structure provides clear separation of responsibilities and better code maintainability.

## Project structure
The project is organized into several main folders:

### 1. `domain/`
This folder contains the application business logic, divided into two parts:
- **`gateways/`**: Defines interfaces that describe interactions with underlying infrastructure.
- **`usecases/`**: Contains use cases that encapsulate business logic.

#### Key files:
- `tags.gateway.ts`: Interface defining methods to manipulate tags.
- `createNewTag.usecase.ts`: Use case for creating a tag.
- `deleteTag.usecase.ts`: Use case for deleting a tag.
- `getListTags.usecase.ts`: Use case to get a list of tags.
- `getTags.usecase.ts`: Use case to retrieve a specific tag.
- `tag.ts`: Defines the tag business entity.

---

### 2. `infra/`
This folder contains concrete implementations of the interfaces defined in `domain/` and manages external interactions.

#### Subfolders:
- **`controllers/`**: Handles incoming requests and invokes appropriate use cases.
  - `tags.controller.ts`: Controller for tag management.
  - `dto/`: Contains Data Transfer Objects used in requests and responses.
    - `create-tag.dto.ts`: DTO for creating a tag.

- **`gateways/`**: Contains implementations of the interfaces defined in `domain/gateways/`.
  - `entities/`: Defines data models and their interactions with the database.
    - `tag.entity.ts`: Data model representing a tag.
  - `tag.gateway.ts`: Concrete implementation of the tag gateway.

---

### 3. `tags.module.ts`
This file groups and exports the different tag-related elements as a module to be used in the application.

![Diamond architecture example](/img/Hex-Architecture-Tags.png)

## Example: adding an update use case
To add a new use case to modify a tag, follow these steps:

1. Add the use case in `domain/usecases/`: create `updateTag.usecase.ts` and implement the tag update logic.
2. Modify the gateway in `domain/gateways/`: add an `updateTag` method to `tags.gateway.ts` to define the update interface.
3. Implement the update in `infra/gateways/`: add the `updateTag` implementation in `tag.gateway.ts` to interact with the database.
4. Add a DTO in `infra/controllers/dto/`: create `update-tag.dto.ts` to define the expected input for the update.
5. Modify the controller in `infra/controllers/`: add a new `PUT /tags/:id` endpoint in `tags.controller.ts` that receives the DTO and calls the update use case.
6. Update the module: register the new use case in `tags.module.ts` and make it available to the application.

## Conclusion
The diamond architecture enforces a strict separation between business logic (`domain`) and infrastructure (`infra`).
- **Use cases** manipulate entities and abstract gateways only.
- **Concrete implementations** live in `infra`.
- **Controllers** orchestrate interactions between the API and business logic.
