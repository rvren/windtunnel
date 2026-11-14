# Scale: what to look for

You must run this for the largest customer. Work through these.

- **Unbounded reads.** Lists and queries with no limit or paging; loading a
  whole table or collection into memory; exports and reports built in one go.
- **Work per item.** A query or a remote call inside a loop (N+1); per-row
  work in a request that should be a batch or a job.
- **Missing indexes and scans.** Filters and sorts on fields with no index;
  text search by scanning; counting by reading everything.
- **Unbounded writes and growth.** Tables, logs, queues, files and caches
  that only grow; no retention, no caps, no clean-up.
- **No limits.** No cap per tenant or user on records, requests, uploads,
  invitations or message sends; no rate limiting on costly routes.
- **Heavy work in the request.** Emails, imports, image or file processing
  and third-party calls done while the person waits, with no queue.
- **Shared bottlenecks.** One lock, one worker, one connection or one global
  in-memory structure that every tenant goes through; state that stops a
  second server from being added.
- **Noisy neighbours.** One tenant's load or data size slowing every other
  tenant; no per-tenant fairness.
- **Fan-out.** One action that touches every member, every record or every
  tenant.

In code, look at data access, list endpoints, loops around I/O, background
jobs and anything held in process memory. Say what number makes it break:
"at 50,000 members this reads every row on each page view".
