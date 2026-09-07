#!/usr/bin/env node
// Creates or updates Inborn's one-time products on Google Play through the Android Publisher API v3
// (`monetization.onetimeproducts`; the legacy `inappproducts` endpoint refuses new apps). Idempotent:
// list → patch with allowMissing → activate the purchase option. US price is the base; every other region
// takes the store's own conversion (`pricing:convertRegionPrices`, tax inclusive where Play charges tax).
//
//   node scripts/play-products.mjs [--list] [--dry-run] [--no-activate] [--only inborn.pro] [--package com.inbornapp.mobile]
//
// Credentials: see scripts/lib/play-api.mjs (INBORN_PLAY_SA_JSON or INBORN_PLAY_SA_KEYCHAIN).
import { URLSearchParams } from "node:url";
import { API, accessToken, client, loadServiceAccount, parseArgs } from "./lib/play-api.mjs";

const args = parseArgs(process.argv.slice(2));
const pkg = args.package ?? "com.inbornapp.mobile";
const BASE = `${API}/${pkg}`;
const PURCHASE_OPTION_ID = "buy";

// Prices are spec §12.1 (US list); ids match packages/core/src/licence/types.ts PRODUCTS.
// Titles keep the brand in Latin script in every language; descriptions follow packages/i18n paywall wording.
const PRODUCTS = [
  {
    productId: "inborn.pro",
    usd: 19.99,
    listings: {
      "en-US": ["Inborn Pro", "All Pro features. Pay once, keep forever."],
      "ja-JP": ["Inborn Pro", "Proの全機能。一度払えば、ずっと自分のもの。"],
      "de-DE": ["Inborn Pro", "Alle Pro-Funktionen. Einmal zahlen, für immer behalten."],
      "fr-FR": ["Inborn Pro", "Toutes les fonctions Pro. Payez une fois, gardez pour toujours."],
      "es-ES": ["Inborn Pro", "Todas las funciones Pro. Paga una vez, es tuyo para siempre."],
      "pt-BR": ["Inborn Pro", "Todos os recursos Pro. Pague uma vez, é seu para sempre."],
    },
  },
  {
    productId: "inborn.pro.launch",
    usd: 14.99,
    listings: {
      "en-US": ["Inborn Pro (Launch Price)", "Pro at launch price. Pay once, keep forever."],
      "ja-JP": ["Inborn Pro（発売記念価格）", "発売記念価格のPro。一度払えば、ずっと自分のもの。"],
      "de-DE": ["Inborn Pro (Startpreis)", "Pro zum Startpreis. Einmal zahlen, für immer behalten."],
      "fr-FR": ["Inborn Pro (prix de lancement)", "Pro au prix de lancement. Payez une fois, gardez pour toujours."],
      "es-ES": ["Inborn Pro (precio de lanzamiento)", "Pro a precio de lanzamiento. Paga una vez, es tuyo para siempre."],
      "pt-BR": ["Inborn Pro (preço de lançamento)", "Pro com preço de lançamento. Pague uma vez, é seu para sempre."],
    },
  },
  {
    productId: "inborn.work",
    usd: 69.99,
    listings: {
      "en-US": ["Inborn Pro for Work", "Work personas and tools. One-time purchase."],
      "ja-JP": ["Inborn Pro for Work", "Work向けのペルソナとツール。買い切り。"],
      "de-DE": ["Inborn Pro for Work", "Work-Personas und Werkzeuge. Einmaliger Kauf."],
      "fr-FR": ["Inborn Pro for Work", "Personas et outils Work. Achat unique."],
      "es-ES": ["Inborn Pro for Work", "Personas y herramientas Work. Pago único."],
      "pt-BR": ["Inborn Pro for Work", "Personas e ferramentas Work. Pagamento único."],
    },
  },
  {
    productId: "inborn.work.upgrade",
    usd: 49.99,
    listings: {
      "en-US": ["Upgrade to Pro for Work", "Pro owners: add Work features. Pay once."],
      "ja-JP": ["Pro for Workにアップグレード", "Proをお持ちの方向け：Work機能を追加。買い切り。"],
      "de-DE": ["Upgrade auf Pro for Work", "Für Pro-Besitzer: Work-Funktionen hinzufügen. Einmal zahlen."],
      "fr-FR": ["Passer à Pro for Work", "Pour les propriétaires de Pro : ajoutez les fonctions Work. Payez une fois."],
      "es-ES": ["Pasar a Pro for Work", "Para dueños de Pro: añade las funciones Work. Paga una vez."],
      "pt-BR": ["Mudar para o Pro for Work", "Para quem tem o Pro: adicione os recursos Work. Pague uma vez."],
    },
  },
];

main().catch((e) => {
  console.error(`play-products: ${e.message}`);
  process.exit(1);
});

async function main() {
  const api = client(await accessToken(loadServiceAccount()));
  const existing = new Map(((await api.get(`${BASE}/oneTimeProducts?pageSize=100`)).oneTimeProducts ?? []).map((p) => [p.productId, p]));

  if (args.list) {
    for (const p of existing.values()) describe(p);
    if (!existing.size) console.log("no one-time products");
    return;
  }

  const wanted = PRODUCTS.filter((p) => !args.only || p.productId === args.only);
  for (const def of wanted) {
    const before = existing.get(def.productId);
    const { body, regionsVersion } = await desired(api, def);
    const same = before && sameListings(before, body) && samePrices(before, body);
    console.log(`\n${def.productId}: ${before ? (same ? "up to date" : "differs, patching") : "missing, creating"}`);
    if (args["dry-run"]) {
      console.log(`  would PATCH ${body.listings.length} listings, regionsVersion ${regionsVersion} US ${money(body.purchaseOptions[0].regionalPricingAndAvailabilityConfigs.find((r) => r.regionCode === "US").price)}`);
      continue;
    }
    let product = before;
    if (!same) {
      const q = new URLSearchParams({ "regionsVersion.version": regionsVersion, allowMissing: "true", updateMask: "listings,purchaseOptions" });
      product = await api.patch(`${BASE}/onetimeproducts/${def.productId}?${q}`, body);
    }
    const option = product.purchaseOptions.find((o) => o.purchaseOptionId === PURCHASE_OPTION_ID);
    if (option.state !== "ACTIVE" && !args["no-activate"]) {
      await api.post(`${BASE}/oneTimeProducts/${def.productId}/purchaseOptions:batchUpdateStates`, {
        requests: [{ activatePurchaseOptionRequest: { packageName: pkg, productId: def.productId, purchaseOptionId: PURCHASE_OPTION_ID } }],
      });
      product = await api.get(`${BASE}/oneTimeProducts/${def.productId}`);
    }
    describe(product);
  }
}

async function desired(api, def) {
  const units = Math.floor(def.usd);
  const conv = await api.post(`${BASE}/pricing:convertRegionPrices`, { price: { currencyCode: "USD", units: String(units), nanos: Math.round((def.usd - units) * 1e9) } });
  const regional = Object.values(conv.convertedRegionPrices)
    .map((r) => ({ regionCode: r.regionCode, price: r.price, availability: "AVAILABLE" }))
    .sort((a, b) => a.regionCode.localeCompare(b.regionCode));
  return {
    regionsVersion: conv.regionVersion.version,
    body: {
      packageName: pkg,
      productId: def.productId,
      listings: Object.entries(def.listings).map(([languageCode, [title, description]]) => ({ languageCode, title, description })),
      purchaseOptions: [
        {
          purchaseOptionId: PURCHASE_OPTION_ID,
          buyOption: { legacyCompatible: true, multiQuantityEnabled: false },
          regionalPricingAndAvailabilityConfigs: regional,
          newRegionsConfig: { usdPrice: conv.convertedOtherRegionsPrice.usdPrice, eurPrice: conv.convertedOtherRegionsPrice.eurPrice, availability: "AVAILABLE" },
        },
      ],
    },
  };
}

function sameListings(a, b) {
  const key = (l) => `${l.languageCode}|${l.title}|${l.description}`;
  const x = (a.listings ?? []).map(key).sort().join("\n");
  return x === b.listings.map(key).sort().join("\n");
}

function samePrices(a, b) {
  const opt = (a.purchaseOptions ?? []).find((o) => o.purchaseOptionId === PURCHASE_OPTION_ID);
  if (!opt) return false;
  const key = (r) => `${r.regionCode}|${r.availability}|${r.price?.currencyCode}|${r.price?.units ?? 0}|${r.price?.nanos ?? 0}`;
  const x = (opt.regionalPricingAndAvailabilityConfigs ?? []).map(key).sort().join("\n");
  return x === b.purchaseOptions[0].regionalPricingAndAvailabilityConfigs.map(key).sort().join("\n");
}

function money(m) {
  return m ? `${m.currencyCode} ${Number(m.units ?? 0) + (m.nanos ?? 0) / 1e9}` : "-";
}

function describe(p) {
  const opt = (p.purchaseOptions ?? [])[0] ?? {};
  const regions = opt.regionalPricingAndAvailabilityConfigs ?? [];
  const pick = (c) => money(regions.find((r) => r.regionCode === c)?.price);
  console.log(`  ${p.productId}: option ${opt.purchaseOptionId} ${opt.state}, ${regions.length} regions, US ${pick("US")}, IL ${pick("IL")}, BR ${pick("BR")}, DE ${pick("DE")}, JP ${pick("JP")}`);
  for (const l of p.listings ?? []) console.log(`    ${l.languageCode}: ${l.title} — ${l.description}`);
}
