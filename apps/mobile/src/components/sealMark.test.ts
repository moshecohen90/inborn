import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sealMark } from "../../../../packages/ui/src/sealMark";

/**
 * Round 128 (Moshe 4.10: the ring in the app did not match the icon's shape or colour). The icon master is the one
 * source; the in-app Seal draws from sealMark, so this reads the master back and fails the moment either moves.
 */
const master = readFileSync(join(__dirname, "../../../../design/icon/inborn-icon.svg"), "utf8");
const seal = readFileSync(join(__dirname, "Seal.tsx"), "utf8");

const ring = /<circle cx="512" cy="512" r="([\d.]+)" fill="none" stroke="(#[0-9A-F]{6})" stroke-width="([\d.]+)"\/>/.exec(master)!;
const [, midR, ringColour, ringStroke] = ring.map((v, i) => (i === 2 ? v : Number(v))) as [string, number, string, number];
const clasp = /<path d="M ([\d.]+) ([\d.]+) A [\d.]+ [\d.]+ 0 0 1 ([\d.]+) ([\d.]+)" fill="none" stroke="(#[0-9A-F]{6})" stroke-width="([\d.]+)" stroke-linecap="round"\/>/g;
const [amber, highlight] = [...master.matchAll(clasp)].map((m) => ({ x1: +m[1]!, y1: +m[2]!, x2: +m[3]!, y2: +m[4]!, colour: m[5]!, width: +m[6]! }));
const glow = /<radialGradient id="filament" cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)" gradientUnits="userSpaceOnUse">([\s\S]*?)<\/radialGradient>/.exec(master)!;
const deg = (x: number, y: number) => ((Math.atan2(y - 512, x - 512) * 180) / Math.PI + 360) % 360;

describe("the in-app seal is the icon (spec §9.8, round 128)", () => {
  it("ring: the icon's green and its stroke share of the outer diameter", () => {
    expect(ringColour).toBe(sealMark.ring);
    expect(sealMark.stroke).toBeCloseTo(ringStroke / (2 * midR + ringStroke), 6);
  });

  it("clasp: amber arc at 2 o'clock, 316° to 344°, with the lighter highlight a third of the stroke", () => {
    expect(amber!.colour).toBe(sealMark.clasp);
    expect(amber!.width).toBe(ringStroke);
    expect(deg(amber!.x1, amber!.y1)).toBeCloseTo(sealMark.claspFrom, 0);
    expect(deg(amber!.x2, amber!.y2)).toBeCloseTo(sealMark.claspTo, 0);
    expect(highlight!.colour).toBe(sealMark.highlight);
    expect(sealMark.highlightStroke).toBeCloseTo(highlight!.width / ringStroke, 6);
    /* Same arc, drawn twice: the highlight lies on the clasp, not beside it. */
    expect([highlight!.x1, highlight!.y1, highlight!.x2, highlight!.y2]).toEqual([amber!.x1, amber!.y1, amber!.x2, amber!.y2]);
  });

  it("glow: an amber disc centred on the clasp, its radius and stops", () => {
    const centre = (sealMark.claspFrom + sealMark.claspTo) / 2;
    expect(+glow[1]!).toBeCloseTo(512 + midR * Math.cos((centre * Math.PI) / 180), 0);
    expect(+glow[2]!).toBeCloseTo(512 + midR * Math.sin((centre * Math.PI) / 180), 0);
    expect(sealMark.glowRadius).toBeCloseTo(+glow[3]! / midR, 6);
    const stops = [...glow[4]!.matchAll(/<stop offset="([\d.]+)" stop-color="(#[0-9A-F]{6})" stop-opacity="([\d.]+)"\/>/g)].map((m) => [+m[1]!, +m[3]!, m[2]!] as const);
    expect(stops.map(([o, a]) => [o, a])).toEqual(sealMark.glowStops.map(([o, a]) => [o, a]));
    for (const [, , colour] of stops) expect(colour).toBe(sealMark.clasp);
  });

  it("Seal.tsx draws from sealMark and opens wider than the clasp it closes into", () => {
    for (const key of ["stroke", "highlightStroke", "claspFrom", "claspTo", "glowRadius", "glowStops", "clasp", "highlight"]) expect(seal).toContain(`sealMark.${key}`);
    expect(seal).not.toMatch(/size \/ 14/);
    const open = Number(/const OPEN_FRACTION = ([\d.]+);/.exec(seal)![1]);
    /* Round caps eat into both the opening and the clasp by half a stroke each side. */
    const capDeg = ((ringStroke / 2 / midR) * 180) / Math.PI;
    const visibleOpening = open * 360 - 2 * capDeg;
    const claspWithCaps = sealMark.claspTo - sealMark.claspFrom + 2 * capDeg;
    expect(visibleOpening).toBeGreaterThan(claspWithCaps);
    expect(visibleOpening).toBeLessThan(claspWithCaps + 15);
  });
});
