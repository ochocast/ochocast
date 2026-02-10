# Backend Architecture

The backend architecture of ochocast is organized around the Hexagonal Architecture principles.

## Hexagonal Architecture

The Hexagonal Architecture is a software architecture that aims to create loosely coupled application components that can be easily connected to their software environment by means of ports and adapters.

![Hexagonal Architecture](../.github/images/HexArchi.png)


## Example

This is an example of a module in this architecture (the events module) :

```bash
events/
├── domain
│   ├── event.ts
│   ├── gateways
│   │   └── events.gateway.ts
│   └── usecases
│        ├── createNewEvent.usecase.ts
├── events.module.ts
└── infra
    ├── controllers
    │    ├── dto
    │    │    └── create-event.dto.ts
    │    └── events.controller.ts
    └── gateways
        ├── entities
        │    └── event.entity.ts
        └── event.gateway.ts
```

## Domain
The domain layer contains the business logic of the application. It is composed of entities, use cases and gateways.


### Objects

[Objects](src/events/domain/event.ts) are the application's data structures. They are the backbone of the application and encapsulate the most general and high-level rules. They are independent of any framework, database or UI. They can also be called entities.


### Use Cases

[Use cases](src/events/domain/usecases/createNewEvent.usecase.ts) are the application's business rules. They are the application's behavior and contain the logic that is specific to the application. They are independent of any framework, database or UI.


### Gateways

[Gateways](src/events/domain/gateways/events.gateway.ts) are the application's interfaces with the infra layer. 


## Infra

The infra layer contains the application's adapters. It is composed of controllers and gateways.


### Controllers

[Controllers](src/events/infra/controllers/events.controller.ts) are the application's adapters to the outside world. They handle incoming HTTP requests, call the application's use cases and return responses to the client.

### DTOs

[DTOs](src/events/infra/controllers/dto/create-event.dto.ts) are the data structures that are used to transfer data between the controllers and the use cases. They are simple objects that contain only the data that is needed by the use cases.

### Entities

[Entities](src/events/infra/gateways/entities/event.entity.ts) are the data structures of the database. They are used by the gateways to access the database.


### Gateways

[Gateways](src/events/infra/gateways/event.gateway.ts) are used to access the database through a repository. They should be simple and only contain the logic that is specific to the database.


## Modules

[The modules](src/events/events.module.ts) are the application's components. They are used by Nest in order to organize the application's codebase and use dependency injection.

