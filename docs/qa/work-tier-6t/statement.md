# Inborn · Architecture statement

Date: 2026-09-24  
Application: Inborn 1.0.0 (build af4079681079) on android  
Licence tier at print time: Pro for Work  
Prepared on the device that runs the software. No part of this document was fetched from a server.

## 1. What the software is

Inborn is a chat assistant that runs a language model (INSTANT) entirely on this device. There is no user account, no server side, no analytics and no telemetry. Every conversation, document, note and setting is created, stored and processed locally.

## 2. Data flow

- Input (typed text, dictation, photos, imported documents) is processed by the model on the device's CPU/GPU and never transmitted.
- Release builds declare no INTERNET permission: the process cannot open a socket. Models arrive through Google Play asset delivery; purchases go through Play Billing.
- The app keeps an exit meter: bytes sent by the process since installation, shown on the Proof screen with the per-session network log.

## 3. Storage and encryption

- Chats are stored in an SQLCipher database; its key lives in the Android Keystore.
- Documents in the library are indexed on the device; the index lives in the same encrypted database.
- Incognito chats are held in memory only and are discarded when closed.
- Purchase entitlements are verified on the device against the store's signature and cached in a sealed file keyed from the same secret.

## 4. Access control

- App lock: biometric or passcode, engaged on launch and after a configurable time in the background; optional emergency wipe after N failed attempts.
- Client vaults: a folder can carry its own passcode (salted hash, never the code). Chats in a vault are hidden until the vault is opened, and the vault closes again whenever the app locks or after 30 minutes.
- Vaults on this device at print time:
- Client Alpha
- Client Beta

## 5. Records

- Each vault keeps an append-only audit log (event, time, subject; never message content). Entries are hash-chained, so a removed or altered entry is detectable.
- Signed export: a chat can be exported as JSON with a SHA-256 content hash and an Ed25519 signature from a key generated on this installation. The public key is included in the file and printed here: 6d30a5a68963e14e8e56a03e67fb08aa295e04c997e9af7acecc6453839be464.

## 6. What this document does not claim

This statement describes the software's architecture as built. It is not a certification of compliance with any law or standard (including health-privacy, legal-privilege or financial-records rules), not a security audit, and not a substitute for the professional's own duties over the device, its passcodes and its backups. Model output can be wrong and must be reviewed by a qualified person before use.

Checking this independently: the network claims above can be verified from outside the app (the Android build declares no INTERNET permission; the iOS App Privacy Report and any firewall show the same). The application's own source code is now published at github.com/moshecohen90/inborn and you are welcome to read it, but this build is not reproducible from it, so a bundle-hash match is not offered as evidence here.