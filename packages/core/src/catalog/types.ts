/** Signed model catalog (spec §5.4). One manifest describes every delivery path; verification is local. */
export type Tier = "instant" | "fast" | "sharp" | "power";
export type Delivery =
  | { kind: "bundled" }
  | { kind: "play-asset-pack"; pack: string; mode: "fast-follow" | "on-demand" }
  | { kind: "apple-asset-pack"; pack: string }
  | { kind: "cdn"; url: string; mirror?: string };

export interface CatalogModel {
  id: string;
  tier: Tier;
  name: string;
  /** Plain-language "what it is good for" shown on the cartridge (spec §6.1). */
  goodFor: string;
  battery: "low" | "medium" | "high" | "highest";
  file: string;
  bytes: number;
  sha256: string;
  license: "Apache-2.0" | "MIT";
  minRamGB: number;
  vision: boolean;
  goodLanguages: string[];
  delivery: Delivery[];
  proOnly: boolean;
}

export interface CatalogManifest {
  version: number;
  publishedAt: string;
  models: CatalogModel[];
  /** Ed25519 signature over the canonical JSON of everything above. */
  signature: string;
}

export function pickDefault(models: CatalogModel[], deviceRamGB: number): CatalogModel | undefined {
  const fits = models.filter((m) => !m.proOnly && m.minRamGB <= deviceRamGB);
  const order: Tier[] = ["fast", "instant", "sharp", "power"];
  return order.map((t) => fits.find((m) => m.tier === t)).find(Boolean);
}
