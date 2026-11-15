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

## Personal data (PII)

Personal data is anything that identifies a person or is about one: names,
email addresses, phone numbers, postal addresses, dates of birth, IP
addresses and device ids, government ids, card and bank numbers, health,
location, and messages people write. Treat card numbers, government ids,
health data and passwords as the most sensitive.

- **Shown to the wrong people.** Responses, lists, exports and search
  results that return more personal data than the caller needs: full user
  rows, other people's emails or phone numbers, password hashes, data of
  another tenant. Check what each role can read, not only what it can change.
- **Logs, errors and analytics.** Personal data written to log lines, error
  messages, stack traces, crash reports, metrics labels or analytics events.
  A card number or a government id in a log is a finding on its own
  (CWE-532).
- **Outside services.** Personal data sent to payment, email, analytics, AI
  or other third-party services: is it more than the service needs, is it
  sent over plain HTTP, and does the requirement say people agreed to it?
- **In addresses.** Personal data or tokens in URLs and query strings, where
  proxies, browser history and referrer headers keep them.
- **Stored unprotected.** Sensitive personal data kept in clear text
  (CWE-312), passwords stored with a weak or unsalted hash, full card
  numbers kept at all when a token would do, backups and exports without
  protection.
- **Kept too long, or never deleted.** No retention period, no way for a
  person to see, export or delete their data, deletion that leaves copies in
  logs, caches, backups, search indexes or outside services.
- **Collected without need.** Fields the product never uses, or collected
  before they are needed (data minimisation).
- **Test and sample data.** Real-looking personal data in seed files,
  fixtures and examples.

In code, use the data inventory as leads: it lists names that hold personal
data and the lines where they reach a log, an outside call or a response.
Open each lead and confirm it before filing; it is found by name, so some
are false. In a written requirement, find what it does not say: which
personal data is collected and why, who may see it, how long it is kept,
how a person deletes it, and which outside services receive it.

Map personal-data findings to CWE-359 (exposure of private personal
information), CWE-532 (sensitive data in logs), CWE-312 (clear-text
storage) or CWE-200 (exposure to an unauthorized actor). Rate them by what
leaks and to whom: card numbers, government ids or health data to anyone
outside is critical; another user's contact details is high; an email
address in a log is medium.

In code, start from the routes and their middleware, then the data access
layer, then the templates and the manifest. Before you stop, go down the
list above once, personal data included, and make sure each item has been
checked against every route. The finding is strongest when you can name the route, the missing
check and the record it exposes.
