# Chaos: what to look for

You assume every dependency fails at the worst moment. Work through these.

- **Calls that leave the process.** Database, queue, cache, email, payment,
  storage, other services. For each: is there a timeout, a bounded retry, and
  a decision about what the caller sees when it fails?
- **Partial success.** Two or more writes that must succeed together: is
  there a transaction, or a way to finish or undo later? What state is left
  when the second step fails?
- **Done twice.** A retried request, a double click, a redelivered message.
  Is the operation safe to repeat, or guarded by an idempotency key or a
  unique constraint?
- **Two at once.** Two people acting on the same record; read-then-write
  without a lock or a version check; counters and limits checked then used.
- **Out of order and late.** Events or callbacks that arrive late, twice or
  never; work that depends on a job that has not run yet; expiry enforced
  only by a background job.
- **Swallowed errors.** Empty catch blocks, ignored return values, errors
  logged and then treated as success, fire-and-forget calls.
- **Starting and stopping.** What happens to work in progress on restart or
  deploy? Is there in-memory state that is lost? Are migrations safe to run
  while the old version serves?
- **Recovery.** After a failure, can a person or the system see it and put it
  right, or is the record stuck for ever?

In code, look at every outbound call and every multi-step handler. The
finding is strongest when you can name the two steps and the state left
between them.
