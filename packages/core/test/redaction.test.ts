import { describe, expect, it } from "vitest";
import { RedactionSession, detect, ibanValid, israeliIdValid, luhnValid, redactText } from "../src/index";

const kinds = (text: string, opts = {}) => detect(text, opts).map((d) => `${d.kind}:${d.value}`);

describe("checksums", () => {
  it("Luhn, IBAN mod-97 and the Israeli ID check digit", () => {
    expect(luhnValid("4539 1488 0343 6467")).toBe(true);
    expect(luhnValid("4539 1488 0343 6468")).toBe(false);
    expect(luhnValid("1234567")).toBe(false);
    expect(ibanValid("GB82 WEST 1234 5698 7654 32")).toBe(true);
    expect(ibanValid("IL62 0108 0000 0009 9999 999")).toBe(true);
    expect(ibanValid("GB82 WEST 1234 5698 7654 33")).toBe(false);
    expect(israeliIdValid("123456782")).toBe(true);
    expect(israeliIdValid("12345674")).toBe(true);
    expect(israeliIdValid("123456789")).toBe(false);
  });
});

describe("detect (English)", () => {
  it("finds emails, phones, cards, IBANs, SSNs and leaves amounts alone", () => {
    const text = "Contact jane.doe@example.com or +1 (415) 555-0134. Card 4539 1488 0343 6467, IBAN GB82 WEST 1234 5698 7654 32, SSN 219-09-9999. Invoice total 1500000 for order 20240915.";
    expect(kinds(text)).toEqual(["email:jane.doe@example.com", "phone:+1 (415) 555-0134", "card:4539 1488 0343 6467", "iban:GB82 WEST 1234 5698 7654 32", "ssn:219-09-9999"]);
  });
  it("names come only from the user's list, case-insensitively, whole words", () => {
    expect(kinds("Met John Smith and Johnny; JOHN SMITH agreed.", { names: ["John Smith"] })).toEqual(["name:John Smith", "name:JOHN SMITH"]);
    expect(kinds("Acme Ltd signed; acmeltd.com is theirs.", { names: ["Acme Ltd"] })).toEqual(["name:Acme Ltd"]);
  });
  it("dates are opt-in", () => {
    const text = "Born 12/03/1985, hired 2021-06-01, left on 3 March 2024. Paid on 2026-09-01. Version 1.2.3.4 stays.";
    expect(kinds(text)).toEqual([]);
    expect(kinds(text, { kinds: { date: true } })).toEqual(["date:12/03/1985", "date:2021-06-01", "date:3 March 2024", "date:2026-09-01"]);
  });
  it("a bare 7-digit number is not a phone; a formatted one is", () => {
    expect(kinds("ref 1234567")).toEqual([]);
    expect(kinds("tel: 555-0134")).toEqual(["phone:555-0134"]);
    expect(kinds("call 020 7946 0958")).toEqual(["phone:020 7946 0958"]);
  });
});

describe("detect (Hebrew)", () => {
  it("Israeli IDs, mobiles and landlines, names with clitic prefixes", () => {
    const text = "שלום, ת\"ז 123456782, נייד 050-123-4567, טלפון 03-9876543. הפגישה עם דוד כהן ועם ודוד כהן נקבעה. כתובת: dan@levi.co.il";
    expect(kinds(text, { names: ["דוד כהן"] })).toEqual(["id:123456782", "phone:050-123-4567", "phone:03-9876543", "name:דוד כהן", "name:דוד כהן", "email:dan@levi.co.il"]);
  });
  it("nine digits with a leading zero are a landline unless the text says ID", () => {
    expect(kinds("039876543")).toEqual(["phone:039876543"]);
    expect(kinds("ת.ז. 012345690")).toEqual(["id:012345690"]);
    expect(kinds("מספר זהות: 123456782")).toEqual(["id:123456782"]);
  });
  it("Hebrew dates when enabled", () => {
    expect(kinds("נולד ב-14 באפריל 1990 ונישא ב-2.5.2015", { kinds: { date: true } })).toEqual(["date:14 באפריל 1990", "date:2.5.2015"]);
  });
});

describe("session", () => {
  it("numbers placeholders per kind, reuses them for the same value, reveals in answers", () => {
    const s = new RedactionSession();
    const first = s.redact("Email jane@x.com and again JANE@X.COM; call 050-1234567 or 0501234567.", {});
    expect(first.text).toBe("Email [EMAIL-1] and again [EMAIL-1]; call [PHONE-1] or [PHONE-1].");
    expect(first.placeholders).toEqual(["[EMAIL-1]", "[PHONE-1]"]);
    expect(first.counts).toEqual({ email: 2, phone: 2 });
    const second = s.redact("Also bob@y.org", {});
    expect(second.text).toBe("Also [EMAIL-2]");
    expect(s.size).toBe(3);
    expect(s.reveal("Write to [EMAIL-1] or [email 2], then dial [PHONE-1]. Unknown [EMAIL-9] stays.")).toBe("Write to jane@x.com or bob@y.org, then dial 050-1234567. Unknown [EMAIL-9] stays.");
    expect(s.reveal("Fullwidth ［EMAIL-1］ too")).toBe("Fullwidth jane@x.com too");
    expect(s.mentions("about [PHONE-1]")).toBe(true);
    expect(s.mentions("nothing here")).toBe(false);
    expect(s.entries().map((e) => e.kind)).toEqual(["email", "phone", "email"]);
  });
  it("redactText is one-shot and keeps the rest of the text byte for byte", () => {
    const r = redactText("A\tB  jane@x.com\n\nC", {});
    expect(r.text).toBe("A\tB  [EMAIL-1]\n\nC");
  });
  it("names inside Hebrew clitics keep the prefix outside the placeholder", () => {
    const r = redactText("דיברתי עם שרה לוי ולשרה לוי יש שאלה", { names: ["שרה לוי"] });
    expect(r.text).toBe("דיברתי עם [NAME-1] ול[NAME-1] יש שאלה");
  });
});
