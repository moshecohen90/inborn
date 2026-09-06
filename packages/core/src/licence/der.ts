/* Just enough DER to read X.509 certificates and SubjectPublicKeyInfo; nothing is written back. */

export interface Tlv {
  tag: number;
  /** Offset of the first content byte. */
  start: number;
  /** Offset after the last content byte. */
  end: number;
  /** Offset of the tag byte, so `bytes.subarray(raw, end)` is the whole element. */
  raw: number;
}

export const TAG = { INTEGER: 0x02, BIT_STRING: 0x03, OCTET_STRING: 0x04, NULL: 0x05, OID: 0x06, UTF8: 0x0c, SEQUENCE: 0x30, SET: 0x31, UTC_TIME: 0x17, GENERALIZED_TIME: 0x18 } as const;

export function readTlv(bytes: Uint8Array, offset: number): Tlv {
  if (offset + 2 > bytes.length) throw new Error("DER: truncated");
  const tag = bytes[offset]!;
  if ((tag & 0x1f) === 0x1f) throw new Error("DER: multi-byte tags unsupported");
  let len = bytes[offset + 1]!;
  let pos = offset + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n === 0 || n > 4 || pos + n > bytes.length) throw new Error("DER: bad length");
    len = 0;
    for (let i = 0; i < n; i++) len = (len << 8) | bytes[pos++]!;
  }
  if (pos + len > bytes.length) throw new Error("DER: truncated");
  return { tag, start: pos, end: pos + len, raw: offset };
}

/** The direct children of a constructed element (SEQUENCE / SET / explicit tag). */
export function children(bytes: Uint8Array, tlv: Tlv): Tlv[] {
  const out: Tlv[] = [];
  let pos = tlv.start;
  while (pos < tlv.end) {
    const c = readTlv(bytes, pos);
    out.push(c);
    pos = c.end;
  }
  return out;
}

export const content = (bytes: Uint8Array, tlv: Tlv): Uint8Array => bytes.subarray(tlv.start, tlv.end);
export const whole = (bytes: Uint8Array, tlv: Tlv): Uint8Array => bytes.subarray(tlv.raw, tlv.end);

export function expect(tlv: Tlv, tag: number, what: string): Tlv {
  if (tlv.tag !== tag) throw new Error(`DER: expected ${what} (tag 0x${tag.toString(16)}), got 0x${tlv.tag.toString(16)}`);
  return tlv;
}

export function decodeOid(bytes: Uint8Array): string {
  if (bytes.length === 0) throw new Error("DER: empty OID");
  const parts: number[] = [];
  let acc = 0;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!;
    acc = acc * 128 + (b & 0x7f);
    if (!(b & 0x80)) {
      if (parts.length === 0) {
        parts.push(Math.min(2, Math.floor(acc / 40)), acc - 40 * Math.min(2, Math.floor(acc / 40)));
      } else parts.push(acc);
      acc = 0;
    }
  }
  return parts.join(".");
}

/** BIT STRING content minus the leading unused-bits byte. */
export function bitStringBytes(bytes: Uint8Array, tlv: Tlv): Uint8Array {
  expect(tlv, TAG.BIT_STRING, "BIT STRING");
  if (bytes[tlv.start] !== 0) throw new Error("DER: unused bits in BIT STRING");
  return bytes.subarray(tlv.start + 1, tlv.end);
}

/** Unsigned big-endian INTEGER (leading zero stripped). */
export function integerBytes(bytes: Uint8Array, tlv: Tlv): Uint8Array {
  expect(tlv, TAG.INTEGER, "INTEGER");
  let c = content(bytes, tlv);
  while (c.length > 1 && c[0] === 0) c = c.subarray(1);
  return c;
}

/** UTCTime / GeneralizedTime → epoch ms (UTC only, which is what X.509 mandates). */
export function timeMs(bytes: Uint8Array, tlv: Tlv): number {
  const s = new TextDecoder().decode(content(bytes, tlv));
  const m = tlv.tag === TAG.UTC_TIME ? /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/.exec(s) : tlv.tag === TAG.GENERALIZED_TIME ? /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\.\d+)?Z$/.exec(s) : null;
  if (!m) throw new Error("DER: bad time");
  let year = Number(m[1]);
  if (tlv.tag === TAG.UTC_TIME) year += year >= 50 ? 1900 : 2000;
  return Date.UTC(year, Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
}
