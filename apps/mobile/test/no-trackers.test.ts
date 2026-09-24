import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const REPO = path.resolve(__dirname, "../../..");
const LOCK = readFileSync(path.join(REPO, "pnpm-lock.yaml"), "utf8");

/**
 * Every package name the lockfile resolves, taken from the `packages:` section keys (`'@scope/name@1.2.3':`).
 * Reading the names rather than the whole file keeps a URL or an integrity hash that happens to contain "branch"
 * from being called an analytics SDK.
 */
function lockedPackageNames(): string[] {
  const start = LOCK.indexOf("\npackages:\n");
  if (start < 0) throw new Error("pnpm-lock.yaml has no packages: section");
  const names = new Set<string>();
  for (const line of LOCK.slice(start).split("\n")) {
    const hit = /^ {2}'?((?:@[^/'@]+\/)?[^'@\s]+)@[^:]*'?:$/.exec(line);
    if (hit) names.add(hit[1]!);
  }
  if (names.size < 100) throw new Error(`only ${names.size} package names parsed out of the lockfile`);
  return [...names];
}

/**
 * F300. The Proof screen prints `TRACKERS 0` as a constant (`Proof.tsx`). It is true today, and nothing kept it true:
 * an analytics, crash, ads or attribution SDK arriving as a transitive dependency of some future package would make
 * the screen lie to every user. This fails the build the moment one is resolved into the lockfile.
 */
const FORBIDDEN: { id: string; re: RegExp }[] = [
  { id: "firebase", re: /^(@firebase\/|firebase$|@react-native-firebase\/)/ },
  { id: "crashlytics", re: /crashlytics/i },
  { id: "sentry", re: /^@sentry(-internal)?\// },
  { id: "bugsnag", re: /^(@bugsnag\/|bugsnag)/ },
  { id: "amplitude", re: /^(@amplitude\/|amplitude-)/ },
  { id: "mixpanel", re: /^(mixpanel|@mixpanel\/)/ },
  { id: "segment", re: /^(@segment\/|analytics-node$)/ },
  { id: "appsflyer", re: /appsflyer/i },
  { id: "adjust", re: /^(react-native-adjust|@adjustcom\/)/ },
  { id: "branch", re: /^(react-native-branch|branch-sdk)$/ },
  { id: "facebook-sdk", re: /^(react-native-fbsdk|@react-native-fbsdk\/|facebook-nodejs-business-sdk)/ },
  { id: "google-analytics", re: /^(@google-analytics\/|react-ga|universal-analytics)/ },
  { id: "datadog", re: /^(@datadog\/|dd-trace$)/ },
  { id: "newrelic", re: /^(newrelic|@newrelic\/)/ },
  { id: "posthog", re: /^(posthog|@posthog\/)/ },
];

describe("F300 · the Proof screen's TRACKERS 0 stays true", () => {
  const names = lockedPackageNames();

  it("no analytics, crash, ads or attribution SDK is anywhere in the lockfile", () => {
    const hits = names.flatMap((n) => FORBIDDEN.filter((f) => f.re.test(n)).map((f) => `${n} (${f.id})`));
    expect(hits).toEqual([]);
  });

  it("the guard can see such a package: each pattern matches its own SDK", () => {
    const samples: Record<string, string> = {
      firebase: "@react-native-firebase/app",
      crashlytics: "@react-native-firebase/crashlytics",
      sentry: "@sentry/react-native",
      bugsnag: "@bugsnag/react-native",
      amplitude: "@amplitude/analytics-react-native",
      mixpanel: "mixpanel-react-native",
      segment: "@segment/analytics-react-native",
      appsflyer: "react-native-appsflyer",
      adjust: "react-native-adjust",
      branch: "react-native-branch",
      "facebook-sdk": "react-native-fbsdk-next",
      "google-analytics": "@google-analytics/data",
      datadog: "@datadog/mobile-react-native",
      newrelic: "newrelic-react-native-agent",
      posthog: "posthog-react-native",
    };
    for (const f of FORBIDDEN) expect(f.re.test(samples[f.id]!), `${f.id} pattern vs ${samples[f.id]}`).toBe(true);
  });

  it("does not fire on the packages this repo really depends on", () => {
    for (const ok of ["react-native", "expo-file-system", "@babel/core", "llama.rn", "typescript", "expo-router"]) {
      expect(FORBIDDEN.some((f) => f.re.test(ok)), ok).toBe(false);
    }
    expect(names).toContain("react-native");
  });

  it("the screen still states the number this guard protects", () => {
    const proof = readFileSync(path.join(REPO, "apps/mobile/src/screens/Proof/Proof.tsx"), "utf8");
    expect(proof).toContain('<Line mono="0" text={t("proof.trackers.line")} />');
  });
});
