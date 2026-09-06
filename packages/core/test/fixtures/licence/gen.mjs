#!/usr/bin/env node
/**
 * Regenerates the TEST keys and certificates for the licence tests (never production material):
 * an EC P-256 chain shaped like Apple's (root → WWDR-style intermediate with OID 1.2.840.113635.100.6.2.1 → receipt-signing
 * leaf with OID 1.2.840.113635.100.6.11.1) and an RSA-2048 pair standing in for the Play licence key.
 *   node packages/core/test/fixtures/licence/gen.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const tmp = mkdtempSync(path.join(tmpdir(), "inborn-licence-fixtures-"));
const ssl = (...args) => execFileSync("openssl", args, { cwd: tmp, stdio: ["ignore", "pipe", "inherit"] });
const cfg = (name, body) => (writeFileSync(path.join(tmp, name), body), name);

const ext = {
  root: cfg("root.ext", "basicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\n"),
  intermediate: cfg("int.ext", "basicConstraints=critical,CA:TRUE,pathlen:0\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\n1.2.840.113635.100.6.2.1=DER:05:00\n"),
  leaf: cfg("leaf.ext", "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=codeSigning\n1.2.840.113635.100.6.11.1=DER:05:00\n"),
  plainLeaf: cfg("plain.ext", "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\n"),
};

for (const name of ["root", "int", "leaf", "plain"]) ssl("ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", `${name}.key`);
ssl("req", "-new", "-x509", "-key", "root.key", "-sha256", "-days", "7300", "-subj", "/CN=Inborn Test Root/O=Inborn Test", "-extensions", "v3", "-config", cfg("root.cnf", "[req]\ndistinguished_name=dn\n[dn]\n[v3]\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\n"), "-out", "root.pem");
const issue = (name, subj, issuerName, extfile) => {
  ssl("req", "-new", "-key", `${name}.key`, "-subj", subj, "-config", cfg(`${name}.cnf`, "[req]\ndistinguished_name=dn\n[dn]\n"), "-out", `${name}.csr`);
  ssl("x509", "-req", "-in", `${name}.csr`, "-CA", `${issuerName}.pem`, "-CAkey", `${issuerName}.key`, "-CAcreateserial", "-sha256", "-days", "7000", "-extfile", extfile, "-out", `${name}.pem`);
};
issue("int", "/CN=Inborn Test WWDR/OU=G1/O=Inborn Test", "root", ext.intermediate);
issue("leaf", "/CN=Inborn Test Receipt Signing/O=Inborn Test", "int", ext.leaf);
issue("plain", "/CN=Inborn Test Plain Leaf/O=Inborn Test", "int", ext.plainLeaf);
ssl("ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", "xcode.key");
ssl("req", "-new", "-x509", "-key", "xcode.key", "-sha256", "-days", "7300", "-subj", "/CN=StoreKit Testing in Xcode/O=StoreKit Testing in Xcode", "-config", cfg("xcode.cnf", "[req]\ndistinguished_name=dn\n[dn]\n"), "-out", "xcode.pem");
ssl("genrsa", "-out", "play.key", "2048");
ssl("rsa", "-in", "play.key", "-pubout", "-out", "play.pub");

for (const f of ["root.key", "root.pem", "int.key", "int.pem", "leaf.key", "leaf.pem", "plain.key", "plain.pem", "xcode.key", "xcode.pem", "play.key", "play.pub"]) writeFileSync(path.join(dir, `test-${f}`), readFileSync(path.join(tmp, f)));
rmSync(tmp, { recursive: true, force: true });
console.log("licence test fixtures written to", dir);
