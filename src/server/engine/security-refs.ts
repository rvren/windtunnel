/*
 * The security references a remediation may cite: the OWASP Top 10 (2021)
 * and a curated list of CWE weaknesses. A model's answer is checked against
 * these lists; an id outside them is replaced, never shown as given.
 */

export interface OwaspCategory {
  id: string;
  name: string;
  url: string;
  /** The CWE to fall back to when a remediation's own CWE is unknown. */
  fallbackCwe: string;
}

export const OWASP_TOP_10: OwaspCategory[] = [
  {
    id: "A01:2021",
    name: "Broken Access Control",
    url: "https://owasp.org/Top10/A01_2021-Broken_Access_Control/",
    fallbackCwe: "CWE-284",
  },
  {
    id: "A02:2021",
    name: "Cryptographic Failures",
    url: "https://owasp.org/Top10/A02_2021-Cryptographic_Failures/",
    fallbackCwe: "CWE-327",
  },
  {
    id: "A03:2021",
    name: "Injection",
    url: "https://owasp.org/Top10/A03_2021-Injection/",
    fallbackCwe: "CWE-74",
  },
  {
    id: "A04:2021",
    name: "Insecure Design",
    url: "https://owasp.org/Top10/A04_2021-Insecure_Design/",
    fallbackCwe: "CWE-657",
  },
  {
    id: "A05:2021",
    name: "Security Misconfiguration",
    url: "https://owasp.org/Top10/A05_2021-Security_Misconfiguration/",
    fallbackCwe: "CWE-16",
  },
  {
    id: "A06:2021",
    name: "Vulnerable and Outdated Components",
    url: "https://owasp.org/Top10/A06_2021-Vulnerable_and_Outdated_Components/",
    fallbackCwe: "CWE-1104",
  },
  {
    id: "A07:2021",
    name: "Identification and Authentication Failures",
    url: "https://owasp.org/Top10/A07_2021-Identification_and_Authentication_Failures/",
    fallbackCwe: "CWE-287",
  },
  {
    id: "A08:2021",
    name: "Software and Data Integrity Failures",
    url: "https://owasp.org/Top10/A08_2021-Software_and_Data_Integrity_Failures/",
    fallbackCwe: "CWE-345",
  },
  {
    id: "A09:2021",
    name: "Security Logging and Monitoring Failures",
    url: "https://owasp.org/Top10/A09_2021-Security_Logging_and_Monitoring_Failures/",
    fallbackCwe: "CWE-778",
  },
  {
    id: "A10:2021",
    name: "Server-Side Request Forgery",
    url: "https://owasp.org/Top10/A10_2021-Server-Side_Request_Forgery_%28SSRF%29/",
    fallbackCwe: "CWE-918",
  },
];

/** CWE id → name. Web, API, auth, crypto, injection, memory, supply chain. */
export const CWE: Record<string, string> = {
  "CWE-16": "Configuration",
  "CWE-20": "Improper Input Validation",
  "CWE-22": "Path Traversal",
  "CWE-23": "Relative Path Traversal",
  "CWE-59": "Link Following",
  "CWE-74": "Injection",
  "CWE-77": "Command Injection",
  "CWE-78": "OS Command Injection",
  "CWE-79": "Cross-site Scripting",
  "CWE-80": "Basic XSS",
  "CWE-88": "Argument Injection",
  "CWE-89": "SQL Injection",
  "CWE-90": "LDAP Injection",
  "CWE-91": "XML Injection",
  "CWE-93": "CRLF Injection",
  "CWE-94": "Code Injection",
  "CWE-95": "Eval Injection",
  "CWE-113": "HTTP Response Splitting",
  "CWE-117": "Improper Output Neutralization for Logs",
  "CWE-119":
    "Improper Restriction of Operations within the Bounds of a Memory Buffer",
  "CWE-120": "Classic Buffer Overflow",
  "CWE-125": "Out-of-bounds Read",
  "CWE-134": "Use of Externally-Controlled Format String",
  "CWE-190": "Integer Overflow or Wraparound",
  "CWE-200": "Exposure of Sensitive Information to an Unauthorized Actor",
  "CWE-201": "Insertion of Sensitive Information Into Sent Data",
  "CWE-209": "Generation of Error Message Containing Sensitive Information",
  "CWE-213": "Exposure of Sensitive Information Due to Incompatible Policies",
  "CWE-250": "Execution with Unnecessary Privileges",
  "CWE-256": "Plaintext Storage of a Password",
  "CWE-259": "Use of Hard-coded Password",
  "CWE-269": "Improper Privilege Management",
  "CWE-276": "Incorrect Default Permissions",
  "CWE-284": "Improper Access Control",
  "CWE-285": "Improper Authorization",
  "CWE-287": "Improper Authentication",
  "CWE-288": "Authentication Bypass Using an Alternate Path or Channel",
  "CWE-290": "Authentication Bypass by Spoofing",
  "CWE-294": "Authentication Bypass by Capture-replay",
  "CWE-295": "Improper Certificate Validation",
  "CWE-297": "Improper Validation of Certificate with Host Mismatch",
  "CWE-306": "Missing Authentication for Critical Function",
  "CWE-307": "Improper Restriction of Excessive Authentication Attempts",
  "CWE-311": "Missing Encryption of Sensitive Data",
  "CWE-312": "Cleartext Storage of Sensitive Information",
  "CWE-319": "Cleartext Transmission of Sensitive Information",
  "CWE-321": "Use of Hard-coded Cryptographic Key",
  "CWE-322": "Key Exchange without Entity Authentication",
  "CWE-326": "Inadequate Encryption Strength",
  "CWE-327": "Use of a Broken or Risky Cryptographic Algorithm",
  "CWE-328": "Use of Weak Hash",
  "CWE-329": "Generation of Predictable IV with CBC Mode",
  "CWE-330": "Use of Insufficiently Random Values",
  "CWE-331": "Insufficient Entropy",
  "CWE-334": "Small Space of Random Values",
  "CWE-338": "Use of Cryptographically Weak PRNG",
  "CWE-345": "Insufficient Verification of Data Authenticity",
  "CWE-346": "Origin Validation Error",
  "CWE-347": "Improper Verification of Cryptographic Signature",
  "CWE-352": "Cross-Site Request Forgery",
  "CWE-359":
    "Exposure of Private Personal Information to an Unauthorized Actor",
  "CWE-362": "Race Condition",
  "CWE-367": "Time-of-check Time-of-use Race Condition",
  "CWE-384": "Session Fixation",
  "CWE-400": "Uncontrolled Resource Consumption",
  "CWE-401": "Missing Release of Memory after Effective Lifetime",
  "CWE-402": "Transmission of Private Resources into a New Sphere",
  "CWE-416": "Use After Free",
  "CWE-434": "Unrestricted Upload of File with Dangerous Type",
  "CWE-444": "HTTP Request Smuggling",
  "CWE-476": "NULL Pointer Dereference",
  "CWE-494": "Download of Code Without Integrity Check",
  "CWE-502": "Deserialization of Untrusted Data",
  "CWE-521": "Weak Password Requirements",
  "CWE-522": "Insufficiently Protected Credentials",
  "CWE-532": "Insertion of Sensitive Information into Log File",
  "CWE-538":
    "Insertion of Sensitive Information into Externally-Accessible File or Directory",
  "CWE-548": "Exposure of Information Through Directory Listing",
  "CWE-552": "Files or Directories Accessible to External Parties",
  "CWE-565": "Reliance on Cookies without Validation and Integrity Checking",
  "CWE-598": "Use of GET Request Method With Sensitive Query Strings",
  "CWE-601": "Open Redirect",
  "CWE-602": "Client-Side Enforcement of Server-Side Security",
  "CWE-611": "XML External Entity Reference",
  "CWE-613": "Insufficient Session Expiration",
  "CWE-614": "Sensitive Cookie in HTTPS Session Without Secure Attribute",
  "CWE-617": "Reachable Assertion",
  "CWE-639": "Authorization Bypass Through User-Controlled Key",
  "CWE-640": "Weak Password Recovery Mechanism for Forgotten Password",
  "CWE-643": "XPath Injection",
  "CWE-657": "Violation of Secure Design Principles",
  "CWE-668": "Exposure of Resource to Wrong Sphere",
  "CWE-670": "Always-Incorrect Control Flow Implementation",
  "CWE-693": "Protection Mechanism Failure",
  "CWE-697": "Incorrect Comparison",
  "CWE-703": "Improper Check or Handling of Exceptional Conditions",
  "CWE-732": "Incorrect Permission Assignment for Critical Resource",
  "CWE-754": "Improper Check for Unusual or Exceptional Conditions",
  "CWE-759": "Use of a One-Way Hash without a Salt",
  "CWE-760": "Use of a One-Way Hash with a Predictable Salt",
  "CWE-770": "Allocation of Resources Without Limits or Throttling",
  "CWE-776": "XML Entity Expansion",
  "CWE-778": "Insufficient Logging",
  "CWE-787": "Out-of-bounds Write",
  "CWE-798": "Use of Hard-coded Credentials",
  "CWE-807": "Reliance on Untrusted Inputs in a Security Decision",
  "CWE-829": "Inclusion of Functionality from Untrusted Control Sphere",
  "CWE-835": "Infinite Loop",
  "CWE-840": "Business Logic Errors",
  "CWE-841": "Improper Enforcement of Behavioral Workflow",
  "CWE-862": "Missing Authorization",
  "CWE-863": "Incorrect Authorization",
  "CWE-915": "Mass Assignment",
  "CWE-916": "Use of Password Hash With Insufficient Computational Effort",
  "CWE-918": "Server-Side Request Forgery",
  "CWE-922": "Insecure Storage of Sensitive Information",
  "CWE-942": "Permissive Cross-domain Policy with Untrusted Domains",
  "CWE-943": "Improper Neutralization of Special Elements in Data Query Logic",
  "CWE-1004": "Sensitive Cookie Without HttpOnly Flag",
  "CWE-1021": "Improper Restriction of Rendered UI Layers or Frames",
  "CWE-1104": "Use of Unmaintained Third Party Components",
  "CWE-1236": "CSV Injection",
  "CWE-1321": "Prototype Pollution",
  "CWE-1333": "Inefficient Regular Expression Complexity",
  "CWE-1336": "Server-Side Template Injection",
  "CWE-1390": "Weak Authentication",
  "CWE-1392": "Use of Default Credentials",
};

export interface CweRef {
  id: string;
  name: string;
  url: string;
  /** True when the model's own id was not known and a category was used. */
  fallback: boolean;
}

const cweUrl = (id: string) =>
  `https://cwe.mitre.org/data/definitions/${id.slice(4)}.html`;

/** The OWASP category for an answer like "A03:2021 Injection" or "A03". */
export function resolveOwasp(value: string): OwaspCategory {
  const code = /A(\d{2})/i.exec(value)?.[1];
  const byCode = OWASP_TOP_10.find((item) => item.id.startsWith(`A${code}:`));
  if (byCode) return byCode;
  const byName = OWASP_TOP_10.find((item) =>
    value.toLowerCase().includes(item.name.toLowerCase()),
  );
  return byName ?? OWASP_TOP_10[3];
}

/** The CWE for an answer like "CWE-89", or the category's fallback. */
export function resolveCwe(value: string, owasp: OwaspCategory): CweRef {
  const id = /CWE-?\s*(\d+)/i.exec(value)?.[1];
  const known = id ? `CWE-${Number(id)}` : null;
  if (known && CWE[known]) {
    return { id: known, name: CWE[known], url: cweUrl(known), fallback: false };
  }
  const fallback = owasp.fallbackCwe;
  return {
    id: fallback,
    name: CWE[fallback],
    url: cweUrl(fallback),
    fallback: true,
  };
}
