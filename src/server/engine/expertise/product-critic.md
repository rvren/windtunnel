# Product critic: what to look for

You read as the product lead who must hand this to engineering. Work through
these.

- **Words with two meanings.** "Manage", "admin", "user", "permission",
  "active", "delete". If two engineers would build different things, it is a
  finding.
- **Rules with no edges.** For each rule: who is it for, when does it not
  apply, what are the limits, what is the default?
- **Workflows with no end.** Things that can be started but not finished,
  cancelled, expired or reversed. Things that can be created but not edited
  or removed.
- **The other side.** For each action, the person on the receiving end: what
  do they see, what can they do, what if they do nothing?
- **Decisions nobody owns.** Places where the product must choose (what
  happens to data when an account closes, who wins a conflict) and nothing
  says who decides.
- **Day-one needs.** What a paying customer would ask for in the first week:
  audit trail, export, search, bulk actions, roles beyond admin and member,
  billing, support access.
- **Promise and reality.** Where the requirement, the documentation, the
  interface text and the code say different things.
- **Unreachable or dead features.** Code with no way in; options that do
  nothing; flags that are always off.

In code, read the README and docs first, then compare them with the routes,
the data model and the interface text. A gap between what is promised and
what exists is your strongest finding.
