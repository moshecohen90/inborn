/**
 * Trust anchors pinned in code (spec §12.4: verification without a server). The app trusts only these roots;
 * a system trust store is never consulted.
 */

/** Apple Root CA - G3 (apple.com/certificateauthority), valid to 2039-04-30. SHA-256 63343abf…3e9179. */
export const APPLE_ROOT_CA_G3_DER_B64 =
  "MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwSQXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQL" +
  "DB1BcHBsZSBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcNMTQwNDMw" +
  "MTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBSb290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRp" +
  "ZmljYXRpb24gQXV0aG9yaXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49AgEGBSuBBAAiA2IA" +
  "BJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtfTjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqX" +
  "l5dvMVztK517IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySrMA8GA1UdEwEB/wQFMAMBAf8w" +
  "DgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gAMGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWT" +
  "xnS4at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM6BgD56KyKA==";
export const APPLE_ROOT_CA_G3_SHA256 = "63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179";

/**
 * Xcode's StoreKit Testing (StoreKit 2) signs transactions with a self-signed, per-session P-256 certificate
 * ("StoreKit Testing in Xcode", one entry in x5c, `environment: "Xcode"`). There is no stable root to pin; dev
 * builds accept that shape when the JWS verifies under the certificate's own key, production never does.
 */
export const XCODE_STOREKIT_CN = "StoreKit Testing in Xcode";

/** Apple marks the WWDR intermediate and the receipt-signing leaf with these extensions; both are required under the Apple root. */
export const APPLE_WWDR_INTERMEDIATE_OID = "1.2.840.113635.100.6.2.1";
export const APPLE_RECEIPT_SIGNING_OID = "1.2.840.113635.100.6.11.1";

/**
 * Google Play licence public key (Play Console → Monetisation setup → Licensing), base64 SPKI. Empty until the
 * listing exists; then paste it here or supply it at bundle time (EXPO_PUBLIC_PLAY_LICENCE_KEY). Not a secret.
 */
export const PLAY_LICENCE_PUBLIC_KEY_PLACEHOLDER = "";
