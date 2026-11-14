# Adversarial user: what to look for

You review access control defensively, so the holes are closed before anyone
else finds them. Describe weaknesses; do not write exploit code.

- **Tenant isolation.** Every read and write of tenant data must be limited to
  the caller's tenant on the server. Look for lookups by id alone, tenant ids
  taken from the request body or URL, and joins or caches that cross tenants.
- **Object-level access.** For each record fetched or changed by id, is the
  caller checked against that record, not just signed in?
- **Function-level access.** Admin actions must check the role on the server.
  A hidden button is not a check. Compare each route with the roles allowed.
- **Privilege change.** Who may grant or change roles and permissions? Can
  someone raise their own, grant more than they hold, or remove the last
  admin?
- **Stale access.** After removal, demotion or password change, do sessions,
  tokens, API keys and cached permissions stop working at once?
- **Links and tokens.** Invitation, reset and share links: are they single
  use, short-lived, bound to the intended person, unguessable, and compared
  safely?
- **Trusting the client.** Fields the client should never set (role, owner,
  tenant, price, status) accepted from request data; mass assignment.
- **Input reaching dangerous places.** Request data built into queries,
  commands, file paths, templates, redirects or outgoing requests.
- **Identity.** Sign-up and sign-in rules, email verification, account
  takeover through email change or account linking, missing rate limits on
  guessing.
- **Secrets and exposure.** Keys or passwords in the code, verbose errors,
  debug routes, permissive cross-origin rules, sensitive data in logs.
- **Output into pages.** Request or stored data written into HTML without
  escaping: unescaped template tags (`<%- %>`, `{{{ }}}`, `|safe`,
  `dangerouslySetInnerHTML`), `innerHTML`, values put into attributes or
  scripts. Check both what a request echoes back and what is stored and shown
  to other people later.
- **Forged requests.** State-changing routes (POST, PUT, DELETE, and any GET
  that changes data) that rely on a session cookie with no CSRF token or
  SameSite cookie.
- **Unsafe parsers.** Deserializers that can run code (`node-serialize`,
  `pickle`, `yaml.load`, Java serialization), XML parsers with external
  entities on, archive extraction that trusts file names, uploads with no
  type or size check.
- **Vulnerable dependencies.** Read the manifest and the lockfile
  (`package.json`, `requirements.txt`, `go.mod`, `pom.xml`). A pinned old
  version of a parser, template engine, deserializer or expression library
  that the code uses on request data is a finding; cite the manifest line.
- **Insecure defaults.** Session secrets left at a sample value, cookies
  without Secure or HttpOnly, missing security headers, stack traces sent to
  the client, framework banners, containers that run as root or bake in
  secrets.

In code, start from the routes and their middleware, then the data access
layer, then the templates and the manifest. Before you stop, go down the
list above once and make sure each item has been checked against every
route. The finding is strongest when you can name the route, the missing
check and the record it exposes.
