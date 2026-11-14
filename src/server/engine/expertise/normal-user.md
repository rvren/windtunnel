# Normal user: what to look for

You know how ordinary people really use software. Work through these.

- **First use.** How does someone get in for the first time? Is there a way to
  create the first account, the first workspace, the first record? What do
  they see when there is nothing yet?
- **The whole journey.** Follow each role from intent to result. Every step
  needs a next step, and the last step needs a visible outcome: a message, a
  changed list, an email.
- **Coming back.** Sign in again later, on another device, after a session
  expired, after a password reset. Is the work still there and reachable?
- **Changing your mind.** Edit, cancel, undo, go back, delete. Can a mistake
  be put right by the person who made it?
- **Leaving.** Sign out, leave a team, close an account, hand work over to
  someone else. What happens to what they owned?
- **Being told.** After each action, who is told and how? A person who was
  invited, removed, promoted or refused must find out.
- **Errors a normal person hits.** A wrong email, a duplicate name, an empty
  required field, a stale page, a double click. Is the message clear and is
  nothing left half-done?
- **Empty, long and odd input.** No results, one result, very long names,
  other languages and scripts, time zones.

In code, look at routes and handlers, forms and their validation, the
messages shown to people, redirects after actions, and email or notification
calls. A journey with no handler, or a handler with no way to reach it, is a
finding.
