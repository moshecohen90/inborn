import { PLAY_LICENCE_PUBLIC_KEY_PLACEHOLDER, decodeAppleJws, verifyAppleJws, verifyLicenceKey, verifyPlayPurchase, type RawPurchase, type VerifyResult } from "@inborn/core";
import { ALLOW_TEST_PURCHASES, BUILD_BUNDLE_ID, PLAY_LICENCE_KEY, devBuild } from "./devFlags";

/** One verifier for every proof shape; the trust policy (test environments, Play key) is decided here, once. */
export function verifyProof(raw: RawPurchase): VerifyResult {
  const allowTest = devBuild() && ALLOW_TEST_PURCHASES;
  /* A QA build ships under its own bundle id (F265); only such a build may accept a proof that is not the store app's. */
  const selfId = allowTest ? BUILD_BUNDLE_ID : undefined;
  switch (raw.proof?.kind) {
    case "apple-jws": {
      const r = verifyAppleJws(raw.proof.jws, { allowTestEnvironments: allowTest, bundleId: selfId });
      if (!r.ok && devBuild()) console.info(`[licence] jws ${r.reason}: ${JSON.stringify(decodeAppleJws(raw.proof.jws)?.header ?? null)} ${raw.proof.jws.slice(0, 40)}… len=${raw.proof.jws.length}`);
      return r;
    }
    case "play":
      return verifyPlayPurchase(raw.proof.json, raw.proof.signature, { publicKey: PLAY_LICENCE_PUBLIC_KEY_PLACEHOLDER || PLAY_LICENCE_KEY, allowTestPurchases: allowTest, packageName: selfId });
    case "licence-key":
      return verifyLicenceKey(raw.proof.key, { deviceId: raw.proof.deviceId });
    default:
      return { ok: false, reason: "malformed" };
  }
}
