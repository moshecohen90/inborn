/**
 * The `_headers` half of the site gate (spec §13.4: zero third-party JS), pure so it can be tested on text.
 *
 * Both script-src forms are needed: the presence check catches a file that dropped the directive, the negative one
 * catches a later per-path block that re-allows scripts. Round 43 replaced the second with the first (QA F200).
 */
export function headerProblems(headers) {
  const problems = [];
  if (!/Content-Security-Policy: default-src 'none'/.test(headers)) problems.push("_headers: CSP must start from default-src 'none'");
  if (!/script-src 'none'/.test(headers)) problems.push("_headers: script-src must be 'none'");
  for (const m of headers.matchAll(/script-src\s+([^;\n]*)/g)) {
    if (m[1].trim() !== "'none'") problems.push(`_headers: script-src must be 'none', not ${m[1].trim()}`);
  }
  if (/form-action\s+(?!'none'|https:\/\/)/.test(headers)) problems.push("_headers: form-action must be 'none' or one https origin");
  return problems;
}
