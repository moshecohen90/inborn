/**
 * The brand mark as numbers, read off design/icon/inborn-icon.svg (spec §9.8): the in-app Seal draws the same object
 * as the app icon from these, and sealMark.test.ts reads the master back so the two cannot drift apart silently.
 * The master is a 1024 box with the ring at r 294 and stroke 92; every number here is relative to the ring itself.
 */
export const sealMark = {
  ring: "#3ECF8E",
  clasp: "#F0B35B",
  highlight: "#FFD9A3",
  /** Ring stroke as a share of the ring's outer diameter (92 / 680). */
  stroke: 92 / 680,
  /** Highlight stroke as a share of the ring stroke (30 / 92). */
  highlightStroke: 30 / 92,
  /** The clasp's arc body in degrees clockwise from 3 o'clock, round caps excluded: 28° centred on 2 o'clock. */
  claspFrom: 316,
  claspTo: 344,
  /** The amber glow is a disc centred on the clasp: its radius as a share of the ring's mid radius (280 / 294). */
  glowRadius: 280 / 294,
  /** [offset, opacity] stops of that disc, centre to rim. */
  glowStops: [
    [0, 0.28],
    [0.45, 0.1],
    [1, 0],
  ],
} as const;
