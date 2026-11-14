# Storefront: a sample project

Three small folders that stand for the repositories of one application. They
exist so the project cockpit can be worked on without calling the model:
`pnpm dev:sample` points Windtunnel at this folder and replays a scripted run
against these files. The flaws in them are deliberate.

- `web`: the shop's frontend
- `api`: the orders service
- `billing`: the service that charges cards
