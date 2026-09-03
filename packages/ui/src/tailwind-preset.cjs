// NativeWind/Tailwind preset: colors resolve through CSS variables so one class works in both themes.
const names = ["bg", "surface1", "surface2", "well", "border", "text", "text2", "text3", "accent", "sealed", "danger", "ctaFill", "ctaText"];
module.exports = {
  theme: {
    extend: {
      colors: Object.fromEntries(names.map((n) => [n, `rgb(var(--f-${n}) / <alpha-value>)`])),
      fontFamily: { sans: ["IBM Plex Sans", "system-ui", "sans-serif"], mono: ["IBM Plex Mono", "ui-monospace", "monospace"] },
      borderRadius: { card: "14px", control: "10px" },
    },
  },
};
