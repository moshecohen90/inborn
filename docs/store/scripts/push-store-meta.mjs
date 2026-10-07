#!/usr/bin/env node
// Pushes the store text and URLs in docs/store/listing.*.json into App Store Connect and Google Play. Idempotent:
// every field is compared with the live value first and only a difference is written. Never touches screenshots,
// builds, in-app purchases, pricing, availability or submission.
//
//   node docs/store/scripts/push-store-meta.mjs [--dry-run | --apply] [--asc-only | --play-only] [--locale ja]
//
// --dry-run (default) reads both stores and prints every write it would make with field lengths. Play has no
// read-only endpoint, so the dry run opens an edit and deletes it without committing.
// Credentials (never printed): the ASC API JSON in the Keychain (INBORN_ASC_KEYCHAIN, default
// store-reviews:appstore-analytics-config) and the Play service account (scripts/lib/play-api.mjs).
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { API, accessToken, client, commitEdit, loadServiceAccount, parseArgs } from "../../../scripts/lib/play-api.mjs";

const args = parseArgs(process.argv.slice(2));
const APPLY = args.apply === true;
const STORE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const ASC_APP = "6809165161";
const ASC_VERSION = "15462083-093b-44c1-8bbd-fe06e00d0c36";
const PLAY_PKG = "com.inbornapp.mobile";
const PRIMARY_CATEGORY = "PRODUCTIVITY";
const SECONDARY_CATEGORY = "UTILITIES";

// listing file → [ASC locale, Play language]
const LOCALES = {
  en: ["en-US", "en-US"],
  ja: ["ja", "ja-JP"],
  de: ["de-DE", "de-DE"],
  fr: ["fr-FR", "fr-FR"],
  es: ["es-ES", "es-ES"],
  "pt-BR": ["pt-BR", "pt-BR"],
  ko: ["ko", "ko-KR"],
  "zh-Hant": ["zh-Hant", "zh-TW"],
};

const selected = Object.keys(LOCALES).filter((l) => !args.locale || args.locale === l || LOCALES[l].includes(args.locale));
if (!selected.length) throw new Error(`unknown --locale ${args.locale}`);
const listings = Object.fromEntries(selected.map((l) => [l, JSON.parse(readFileSync(join(STORE_DIR, `listing.${l}.json`), "utf8"))]));
const en = JSON.parse(readFileSync(join(STORE_DIR, "listing.en.json"), "utf8"));

const maskEmail = (s) => (s ?? "").replace(/^(.{3}).*(@.*)$/, "$1…$2");
const maskPhone = (s) => (s ? `${s.slice(0, 6)}…` : "");
const size = (v) => (typeof v === "string" ? (/^https?:/.test(v) ? v : `${[...v].length}ch/${Buffer.byteLength(v)}B`) : JSON.stringify(v));
const sizes = (o, mask = {}) => Object.entries(o).map(([k, v]) => `${k}=${mask[k] ? mask[k](v) : size(v)}`).join(" ");
const changed = (want, have) => Object.fromEntries(Object.entries(want).filter(([k, v]) => (have?.[k] ?? "") !== v));
let failures = 0;

function preflight() {
  const out = [];
  for (const l of selected) out.push(...Object.values(listings[l].urls ?? {}));
  return [...new Set(out)];
}

async function checkUrls() {
  for (const u of preflight()) {
    const r = await fetch(u, { redirect: "follow" });
    console.log(`URL ${r.status} ${u}`);
    if (r.status !== 200) throw new Error(`${u} answers ${r.status}; refusing to publish it`);
  }
}

async function supportEmail(url) {
  const html = await (await fetch(url)).text();
  const found = [...new Set(html.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? [])];
  if (found.length !== 1) throw new Error(`${url} shows ${found.length} email addresses; set the Play contact email by hand`);
  return found[0];
}

// ---------- App Store Connect ----------

function ascToken() {
  const [svc, acct] = (process.env.INBORN_ASC_KEYCHAIN ?? "store-reviews:appstore-analytics-config").split(":");
  const c = JSON.parse(execFileSync("security", ["find-generic-password", "-s", svc, "-a", acct, "-w"], { encoding: "utf8" }).trim());
  const b64 = (s) => Buffer.from(s).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const input = `${b64(JSON.stringify({ alg: "ES256", kid: c.key_id, typ: "JWT" }))}.${b64(JSON.stringify({ iss: c.issuer_id, iat: now, exp: now + 1200, aud: "appstoreconnect-v1" }))}`;
  return `${input}.${b64(crypto.sign("sha256", Buffer.from(input), { key: c.private_key, dsaEncoding: "ieee-p1363" }))}`;
}

function ascClient(token) {
  return async (method, path, body) => {
    const r = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await r.json().catch(() => null);
    return { status: r.status, json, error: r.status >= 400 ? (json?.errors ?? []).map((e) => `${e.code}: ${e.detail ?? e.title}`).join(" | ") : null };
  };
}

async function ascWrite(asc, label, method, path, body, mask) {
  const attrs = body.data.attributes ?? {};
  const desc = `ASC ${method} ${path} ${label} ${sizes(attrs, mask)}${body.data.relationships ? ` rel=${Object.keys(body.data.relationships).join(",")}` : ""}`;
  if (!APPLY) return console.log(`DRY ${desc}`), { status: 0 };
  const r = await asc(method, path, body);
  console.log(`${desc} → ${r.status}${r.error ? ` ${r.error}` : ""}`);
  return r;
}

async function pushAsc() {
  const asc = ascClient(ascToken());
  const get = async (p) => {
    const r = await asc("GET", p);
    if (r.status >= 400) throw new Error(`GET ${p} → ${r.status} ${r.error}`);
    return r.json;
  };

  const version = await get(`/v1/appStoreVersions/${ASC_VERSION}?fields[appStoreVersions]=versionString,appStoreState`);
  console.log(`ASC version ${version.data.attributes.versionString} ${version.data.attributes.appStoreState}`);
  const vlocs = (await get(`/v1/appStoreVersions/${ASC_VERSION}/appStoreVersionLocalizations?limit=50`)).data;
  let whatsNewRefused = false;

  for (const l of selected) {
    const [locale] = LOCALES[l];
    const j = listings[l];
    const want = {
      description: j.apple.description,
      keywords: j.apple.keywords,
      promotionalText: j.apple.promotional_text,
      supportUrl: j.urls.support,
      marketingUrl: j.urls.marketing,
    };
    const have = vlocs.find((x) => x.attributes.locale === locale);
    let id = have?.id;
    const diff = changed(want, have?.attributes);
    if (!have) {
      const r = await ascWrite(asc, locale, "POST", "/v1/appStoreVersionLocalizations", {
        data: { type: "appStoreVersionLocalizations", attributes: { locale, ...want }, relationships: { appStoreVersion: { data: { type: "appStoreVersions", id: ASC_VERSION } } } },
      });
      if (r.status >= 400) failures++;
      id = r.json?.data?.id;
    } else if (Object.keys(diff).length) {
      const r = await ascWrite(asc, locale, "PATCH", `/v1/appStoreVersionLocalizations/${id}`, { data: { type: "appStoreVersionLocalizations", id, attributes: diff } });
      if (r.status >= 400) failures++;
    } else console.log(`ASC appStoreVersionLocalization ${locale} unchanged`);

    // Apple refuses What's New on an app's first version; a separate call keeps that refusal from blocking the rest.
    if (!whatsNewRefused && j.apple.whats_new && (have?.attributes?.whatsNew ?? "") !== j.apple.whats_new && (id || !APPLY)) {
      const r = await ascWrite(asc, `${locale} whatsNew`, "PATCH", `/v1/appStoreVersionLocalizations/${id ?? "<new>"}`, {
        data: { type: "appStoreVersionLocalizations", id, attributes: { whatsNew: j.apple.whats_new } },
      });
      if (r.status === 409) (whatsNewRefused = true), console.log("ASC whatsNew skipped in every locale: Apple does not accept it on this version");
      else if (r.status >= 400) failures++;
    }
  }

  const infos = (await get(`/v1/apps/${ASC_APP}/appInfos?include=primaryCategory,secondaryCategory`)).data;
  const info = infos.find((i) => i.attributes.appStoreState !== "READY_FOR_SALE") ?? infos[0];
  const ilocs = (await get(`/v1/appInfos/${info.id}/appInfoLocalizations?limit=50`)).data;
  for (const l of selected) {
    const [locale] = LOCALES[l];
    const j = listings[l];
    const want = { name: j.apple.name, subtitle: j.apple.subtitle, privacyPolicyUrl: j.urls.privacy };
    const have = ilocs.find((x) => x.attributes.locale === locale);
    const diff = changed(want, have?.attributes);
    let r;
    if (!have) {
      r = await ascWrite(asc, locale, "POST", "/v1/appInfoLocalizations", {
        data: { type: "appInfoLocalizations", attributes: { locale, ...want }, relationships: { appInfo: { data: { type: "appInfos", id: info.id } } } },
      });
    } else if (Object.keys(diff).length) {
      r = await ascWrite(asc, locale, "PATCH", `/v1/appInfoLocalizations/${have.id}`, { data: { type: "appInfoLocalizations", id: have.id, attributes: diff } });
    } else console.log(`ASC appInfoLocalization ${locale} unchanged`);
    if (r?.status >= 400) failures++;
  }

  if (!args.locale) {
    const rel = {};
    if (info.relationships?.primaryCategory?.data?.id !== PRIMARY_CATEGORY) rel.primaryCategory = { data: { type: "appCategories", id: PRIMARY_CATEGORY } };
    if (info.relationships?.secondaryCategory?.data?.id !== SECONDARY_CATEGORY) rel.secondaryCategory = { data: { type: "appCategories", id: SECONDARY_CATEGORY } };
    if (Object.keys(rel).length) {
      const r = await ascWrite(asc, Object.entries(rel).map(([k, v]) => `${k}=${v.data.id}`).join(" "), "PATCH", `/v1/appInfos/${info.id}`, { data: { type: "appInfos", id: info.id, relationships: rel } });
      if (r.status >= 400) failures++;
    } else console.log(`ASC categories unchanged (${PRIMARY_CATEGORY} / ${SECONDARY_CATEGORY})`);
    await pushReviewDetail(asc, get);
  }
}

// The contact is copied from a live app of the same team so it never lives in this public repo.
async function reviewContact(get) {
  const apps = (await get(`/v1/apps?limit=200&fields[apps]=name,bundleId`)).data.filter((a) => a.id !== ASC_APP);
  for (const app of apps) {
    const live = (await get(`/v1/apps/${app.id}/appStoreVersions?filter[appStoreState]=READY_FOR_SALE&limit=1`)).data[0];
    if (!live) continue;
    const rd = (await get(`/v1/appStoreVersions/${live.id}/appStoreReviewDetail`)).data?.attributes;
    if (rd?.contactFirstName && rd.contactLastName && rd.contactPhone && rd.contactEmail) {
      console.log(`ASC review contact copied from "${app.attributes.name}" (${app.id}): ${rd.contactFirstName} ${rd.contactLastName[0]}. ${maskPhone(rd.contactPhone)} ${maskEmail(rd.contactEmail)}`);
      return { contactFirstName: rd.contactFirstName, contactLastName: rd.contactLastName, contactPhone: rd.contactPhone, contactEmail: rd.contactEmail };
    }
  }
  throw new Error("no READY_FOR_SALE app of this team has a complete App Review contact");
}

async function pushReviewDetail(asc, get) {
  const want = { ...(await reviewContact(get)), demoAccountRequired: false, notes: en.reviewer_notes };
  const mask = { contactPhone: maskPhone, contactEmail: maskEmail, contactLastName: (s) => `${s[0]}.` };
  const have = (await get(`/v1/appStoreVersions/${ASC_VERSION}/appStoreReviewDetail`)).data;
  let r;
  if (!have) {
    r = await ascWrite(asc, "", "POST", "/v1/appStoreReviewDetails", {
      data: { type: "appStoreReviewDetails", attributes: want, relationships: { appStoreVersion: { data: { type: "appStoreVersions", id: ASC_VERSION } } } },
    }, mask);
  } else {
    const diff = Object.fromEntries(Object.entries(want).filter(([k, v]) => have.attributes[k] !== v));
    if (Object.keys(diff).length) r = await ascWrite(asc, "", "PATCH", `/v1/appStoreReviewDetails/${have.id}`, { data: { type: "appStoreReviewDetails", id: have.id, attributes: diff } }, mask);
    else console.log("ASC appStoreReviewDetail unchanged");
  }
  if (r?.status >= 400) failures++;
}

// ---------- Google Play ----------

async function pushPlay() {
  process.env.INBORN_PLAY_SA_KEYCHAIN ??= "store-reviews:play-service-account";
  const api = client(await accessToken(loadServiceAccount()));
  const email = await supportEmail(en.urls.support);
  const edit = await api.post(`${API}/${PLAY_PKG}/edits`, {});
  const base = `${API}/${PLAY_PKG}/edits/${edit.id}`;
  let writes = 0;
  const write = async (method, path, body) => {
    const desc = `PLAY ${method} ${path} ${sizes(body)}`;
    if (!APPLY) return console.log(`DRY ${desc}`), writes++;
    await api[method.toLowerCase()](`${base}${path}`, body);
    console.log(`${desc} → 200`);
    writes++;
  };
  try {
    const { listings: live = [] } = await api.get(`${base}/listings`);
    for (const l of selected) {
      const [, language] = LOCALES[l];
      const g = listings[l].google;
      const want = { title: g.title, shortDescription: g.short_description, fullDescription: g.full_description };
      const have = live.find((x) => x.language === language);
      if (Object.keys(changed(want, have)).length) await write("PUT", `/listings/${language}`, { language, ...want, ...(have?.video ? { video: have.video } : {}) });
      else console.log(`PLAY listing ${language} unchanged`);
    }
    if (!args.locale) {
      const details = await api.get(`${base}/details`);
      const want = { defaultLanguage: "en-US", contactEmail: email, contactWebsite: en.urls.marketing };
      const diff = changed(want, details);
      if (Object.keys(diff).length) await write("PATCH", "/details", diff);
      else console.log("PLAY details unchanged");
    }
    if (APPLY && writes) {
      await commitEdit(api, PLAY_PKG, edit.id);
      console.log(`PLAY edit ${edit.id} committed → 200`);
      return;
    }
    console.log(APPLY ? "PLAY nothing to change" : `PLAY dry run: ${writes} write(s) planned, edit discarded`);
  } catch (e) {
    failures++;
    console.log(`PLAY failed, edit discarded: ${e.message}`);
  }
  await api.del(`${API}/${PLAY_PKG}/edits/${edit.id}`).catch(() => {});
}

console.log(`${APPLY ? "APPLY" : "DRY RUN"} locales=${selected.join(",")}`);
await checkUrls();
if (!args["play-only"]) await pushAsc();
if (!args["asc-only"]) await pushPlay();
if (failures) {
  console.log(`${failures} call(s) failed`);
  process.exit(1);
}
