# Storefront: a sample application

Seven small services that stand for the repositories of one application: a
shop. They exist so Windtunnel's project cockpit has something believable to
read. The flaws in them are deliberate, and nothing here is meant to be run.

| Folder          | Repository                       | What it is               |
| --------------- | -------------------------------- | ------------------------ |
| `web`           | `rvren/storefront-web`           | The shop frontend        |
| `gateway`       | `rvren/storefront-gateway`       | The API gateway          |
| `auth`          | `rvren/storefront-auth`          | Sign-in and sessions     |
| `catalog`       | `rvren/storefront-catalog`       | Products and search      |
| `orders`        | `rvren/storefront-orders`        | Orders and checkout      |
| `billing`       | `rvren/storefront-billing`       | Card charges             |
| `notifications` | `rvren/storefront-notifications` | The email worker         |

This folder is the source of truth. `scripts/publish-samples.sh` pushes each
folder to its private repository.
