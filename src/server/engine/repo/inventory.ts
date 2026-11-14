import type { DataSink, Inventory, PiiCategory } from "../schema";

/*
 * The data inventory: where a repository handles personal data and where it
 * holds secrets, found by name and pattern, in code, with no model. It is a
 * heuristic and says so wherever it is shown. A secret's value is never kept:
 * only its kind, its place, and the line with the value masked.
 */

/** Names that hold personal data, by category, written as lowercase words. */
const TERMS: Record<PiiCategory, string[]> = {
  contact: [
    "email",
    "emailaddress",
    "phone",
    "phonenumber",
    "mobile",
    "mobilenumber",
    "telephone",
    "faxnumber",
  ],
  identity: [
    "firstname",
    "lastname",
    "fullname",
    "surname",
    "givenname",
    "dateofbirth",
    "birthdate",
    "birthday",
    "dob",
    "ssn",
    "socialsecurity",
    "nationalid",
    "nationalidentifier",
    "passport",
    "passportnumber",
    "driverlicense",
    "driverslicense",
    "taxid",
    "gender",
    "nationality",
  ],
  financial: [
    "iban",
    "cardnumber",
    "creditcard",
    "ccnumber",
    "cvv",
    "cvc",
    "bankaccount",
    "accountnumber",
    "routingnumber",
    "sortcode",
    "salary",
    "card",
  ],
  location: [
    "address",
    "streetaddress",
    "homeaddress",
    "postcode",
    "postalcode",
    "zipcode",
    "latitude",
    "longitude",
    "geolocation",
    "geo",
  ],
  health: [
    "diagnosis",
    "medical",
    "medicalrecord",
    "healthrecord",
    "bloodtype",
    "prescription",
    "allergy",
    "disability",
    "insurancenumber",
  ],
  credentials: [
    "password",
    "passwd",
    "passwordhash",
    "pin",
    "securityanswer",
    "secretanswer",
    "otp",
    "mfasecret",
  ],
  online: [
    "ipaddress",
    "clientip",
    "remoteaddr",
    "remoteip",
    "deviceid",
    "advertisingid",
    "imei",
    "macaddress",
    "useragent",
    "cookieid",
    "sessionid",
  ],
};

/** Short or common words that must be the whole name, not a part of it. */
const WHOLE = new Set([
  "dob",
  "ssn",
  "cvv",
  "cvc",
  "pin",
  "otp",
  "geo",
  "card",
  "phone",
  "mobile",
  "gender",
]);

/** A name with one of these parts is about the field, not the data. */
const NOT_DATA =
  /(template|validator|validate|regex|pattern|label|placeholder|icon|type|format|field|input|column|enabled|verified|count|length|service|provider|config|button|link|error|message|subject|sender|from|button|title|class|style)$/;

const BY_WORD = new Map<string, PiiCategory>(
  Object.entries(TERMS).flatMap(([category, words]) =>
    words.map((word) => [word, category as PiiCategory] as const),
  ),
);

/** Where a line sends what it holds. */
const SINKS: [DataSink, RegExp][] = [
  [
    "log",
    /\b(console\.(log|info|warn|error|debug)|logger?\.(info|debug|warn|warning|error|trace|fatal|log)|logging\.(info|debug|warning|error)|log\.(Print|Printf|Println|info|debug|warn|error)|print\(|println!?\(|printf\(|fmt\.Print|System\.out\.print|Log\.[dievw]\()/,
  ],
  [
    "outside",
    /\b(fetch\(|axios|http\.(Post|Get|request|post|get)|https?\.request|requests\.(get|post|put|patch)|urllib|HttpClient|got\(|superagent|sendgrid|mailgun|ses\.send|twilio|analytics\.(track|identify)|mixpanel|segment\.|posthog|sentry\.|emailProvider|smtp)/i,
  ],
  [
    "storage",
    /\b(insert|INSERT INTO|UPDATE |\.save\(|\.create\(|\.update\(|setItem\(|localStorage|sessionStorage|\.put\(|redis|\.set\(|writeFile|\.execute\(|\.query\()/,
  ],
  [
    "response",
    /\b(res\.(json|send)|response\.(json|write)|jsonify\(|JsonResponse|JSONResponse|render\(|innerHTML|return\s+json)/,
  ],
];

/** Secret formats that are recognisable on their own. */
const SECRET_FORMATS: [string, RegExp][] = [
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
  ["Stripe secret key", /\b(sk|rk)_(live|test)_[A-Za-z0-9]{16,}\b/],
  ["Slack token", /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  [
    "Private key",
    /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/,
  ],
  [
    "JSON Web Token",
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  ],
];

/** A literal assigned to a name that says it is secret. */
const SECRET_ASSIGNMENT =
  /\b([A-Za-z_]*(?:password|passwd|pwd|secret|api_?key|apikey|access_?token|auth_?token|client_?secret|private_?key)[A-Za-z_]*)\s*[:=]\s*(["'`])([^"'`\s]{6,})\2/i;

/** Values that are placeholders, not secrets. */
const PLACEHOLDER =
  /^(\$\{|process\.env|os\.environ|<|your[_-]|xxx|changeme|example|placeholder|dummy|test|secret$|password$|\*+$)/i;

/** Files that are not code: no personal data names are looked for there. */
const NOT_CODE =
  /\.(md|mdx|txt|rst|lock|svg|csv|tsv|json|ya?ml|toml|ini|cfg|xml|html?|css|scss|sass|less|snap)$/i;
/** Files where a secret is most often a sample, still reported, but marked. */
const LIMITS = { files: 6000, perKind: 400 } as const;

/** The words of a line's names: camelCase and snake_case split, lowercase. */
function names(line: string): { name: string; words: string }[] {
  return [...line.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)].map(([name]) => ({
    name,
    words: name.replace(/_/g, "").toLowerCase(),
  }));
}

/** The personal-data category of a name, if it holds personal data. */
export function piiOf(
  name: string,
): { category: PiiCategory; term: string } | null {
  const words = name.replace(/_/g, "").toLowerCase();
  if (words.length < 3 || NOT_DATA.test(words)) return null;
  const exact = BY_WORD.get(words);
  if (exact) return { category: exact, term: words };
  for (const [term, category] of BY_WORD) {
    if (WHOLE.has(term) || term.length < 5) continue;
    if (words.includes(term)) return { category, term };
  }
  return null;
}

/** The sinks a line sends to. */
export function sinksOf(line: string): DataSink[] {
  return SINKS.filter(([, pattern]) => pattern.test(line)).map(
    ([sink]) => sink,
  );
}

/** A secret on this line, with the line masked, or null. */
export function secretOf(
  line: string,
): { kind: string; masked: string; value: string } | null {
  for (const [kind, pattern] of SECRET_FORMATS) {
    const found = pattern.exec(line);
    if (found) {
      return {
        kind,
        masked: line.replace(found[0], mask(found[0])).trim(),
        value: found[0],
      };
    }
  }
  const assigned = SECRET_ASSIGNMENT.exec(line);
  if (assigned && !PLACEHOLDER.test(assigned[3])) {
    return {
      kind: "Hard-coded secret",
      masked: line.replace(assigned[3], mask(assigned[3])).trim(),
      value: assigned[3],
    };
  }
  return null;
}

/** Keeps the first two characters so the kind is visible, hides the rest. */
function mask(value: string): string {
  return `${value.slice(0, 2)}${"•".repeat(Math.min(12, Math.max(4, value.length - 2)))}`;
}

/**
 * Scans the files. `read` gives a file's lines. The secrets' values are
 * handed back apart from the inventory, so the run can keep them out of what
 * it writes; they are never saved.
 */
export async function takeInventory(
  paths: string[],
  read: (path: string) => Promise<string[]>,
): Promise<{ inventory: Inventory; secretValues: string[] }> {
  const secretValues: string[] = [];
  const inventory: Inventory = {
    pii: [],
    secrets: [],
    filesScanned: 0,
    truncated: paths.length > LIMITS.files,
  };
  for (const path of paths.slice(0, LIMITS.files)) {
    let lines: string[];
    try {
      lines = await read(path);
    } catch {
      continue;
    }
    inventory.filesScanned += 1;
    const code = !NOT_CODE.test(path);
    lines.forEach((text, index) => {
      if (text.length > 2000) return;
      const line = index + 1;
      if (inventory.secrets.length < LIMITS.perKind) {
        const secret = secretOf(text);
        if (secret) {
          const { value, ...kept } = secret;
          secretValues.push(value);
          inventory.secrets.push({ ...kept, path, line });
        }
      }
      if (!code || inventory.pii.length >= LIMITS.perKind * 4) return;
      const seen = new Set<PiiCategory>();
      for (const { name } of names(text)) {
        const pii = piiOf(name);
        if (!pii || seen.has(pii.category)) continue;
        seen.add(pii.category);
        inventory.pii.push({ ...pii, path, line, sinks: sinksOf(text) });
      }
    });
  }
  return { inventory, secretValues };
}

/** A short summary for the agents' shared context. */
export function inventorySummary(inventory: Inventory): string {
  const lines: string[] = [];
  const byCategory = new Map<PiiCategory, typeof inventory.pii>();
  for (const item of inventory.pii) {
    byCategory.set(item.category, [
      ...(byCategory.get(item.category) ?? []),
      item,
    ]);
  }
  for (const [category, items] of byCategory) {
    const sinks = [...new Set(items.flatMap((item) => item.sinks))];
    const flows = items
      .filter((item) => item.sinks.some((sink) => sink !== "storage"))
      .slice(0, 6)
      .map((item) => `${item.path}:${item.line} (${item.sinks.join(", ")})`);
    lines.push(
      `- ${category}: ${items.length} places${sinks.length ? `; reaches ${sinks.join(", ")}` : ""}${flows.length ? `. For example ${flows.join("; ")}` : ""}`,
    );
  }
  if (inventory.secrets.length > 0) {
    lines.push(
      `- secrets written into the code: ${inventory.secrets
        .slice(0, 10)
        .map((item) => `${item.kind} at ${item.path}:${item.line}`)
        .join("; ")}`,
    );
  }
  return lines.length > 0
    ? `<data_inventory>\nFound by name in the code, so it may include false positives. Check what matters.\n${lines.join("\n")}\n</data_inventory>`
    : "";
}
