# Backend Diamond Architecture Documentation

## Introduction
This document describes the backend organization following a diamond architecture. This structure allows for a clear separation of responsibilities and better code maintainability.

## Project Structure
The project is organized into several main folders:

### 1. `domain/`
This folder contains the application's business logic, divided into two sub-parts:
- **`gateways/`**: Defines interfaces that describe interactions with the underlying infrastructure.
- **`usecases/`**: Contains use cases that encapsulate business logic.

#### Key files:
- `tags.gateway.ts`: Interface defining tag manipulation methods.
- `createNewTag.usecase.ts`: Use case for creating a tag.
- `deleteTag.usecase.ts`: Use case for deleting a tag.
- `getListTags.usecase.ts`: Use case for getting a list of tags.
- `getTags.usecase.ts`: Use case for retrieving a specific tag.
- `tag.ts`: Defines the tag business entity.

---

### 2. `infra/`
This folder contains the concrete implementation of interfaces defined in `domain/` as well as external interaction management.

#### Subfolders:
- **`controllers/`**: Handles incoming requests and invokes appropriate use cases.
  - `tags.controller.ts`: Controller for tag management.
  - `dto/`: Contains Data Transfer Objects (DTOs) used in requests and responses.
    - `create-tag.dto.ts`: DTO for tag creation.

- **`gateways/`**: Contains implementations of interfaces defined in `domain/gateways/`.
  - `entities/`: Defines data models and their interactions with the database.
    - `tag.entity.ts`: Data model representing a tag.
  - `tag.gateway.ts`: Concrete gateway implementation for tags.

---

### 3. `tags.module.ts`
This file groups and exports the various tag-related elements as a module to be used in the application.

![Diamond structure example](/img/Hex-Architecture-Tags.png)


## Example: Adding an Update Feature
To add a new use case to modify a tag, follow these steps:

### 1. Add the use case in `domain/usecases/`
Create a file `updateTag.usecase.ts` and implement the business logic for tag modification.

### 2. Modify the gateway in `domain/gateways/`
Add an `updateTag` method in `tags.gateway.ts` to define the update interface.

### 3. Implement the update in `infra/gateways/`
In `tag.gateway.ts`, add the implementation of the `updateTag` method to interact with the database.

### 4. Add a DTO in `infra/controllers/dto/`
Create a file `update-tag.dto.ts` to define the format of data received for modification.

### 5. Modify the controller in `infra/controllers/`
In `tags.controller.ts`, add a new endpoint `PUT /tags/:id` that receives DTO data and calls the update use case.

### 6. Update the module
In `tags.module.ts`, register the new use case and make it available to the application.

## Conclusion
The diamond architecture provides a strict separation between business logic (`domain`) and infrastructure (`infra`).
- **Use cases** only manipulate entities and abstract gateways.
- **Concrete implementations** are located in `infra`.
- **Controllers** orchestrate interactions between the API and business logic.