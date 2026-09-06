/**
 * Readable form of the small LaTeX subset chat models emit (§9.6 "math is shown verbatim" is not readable
 * on a phone: `$17 \times 23$` must read as `17 × 23`). No renderer, no fonts: Unicode only.
 */

const SYMBOLS: Record<string, string> = {
  times: "×", cdot: "·", div: "÷", pm: "±", mp: "∓", le: "≤", leq: "≤", ge: "≥", geq: "≥", ne: "≠", neq: "≠",
  approx: "≈", equiv: "≡", sim: "∼", infty: "∞", to: "→", rightarrow: "→", leftarrow: "←", Rightarrow: "⇒",
  Leftarrow: "⇐", iff: "⇔", Leftrightarrow: "⇔", ldots: "…", dots: "…", cdots: "⋯", vdots: "⋮", sum: "Σ", prod: "∏",
  int: "∫", partial: "∂", nabla: "∇", in: "∈", notin: "∉", subset: "⊂", subseteq: "⊆", cup: "∪", cap: "∩",
  forall: "∀", exists: "∃", neg: "¬", land: "∧", lor: "∨", angle: "∠", perp: "⊥", parallel: "∥", degree: "°",
  circ: "°", bullet: "•", star: "☆", ast: "∗", prime: "′", hbar: "ℏ", ell: "ℓ", Re: "ℜ", Im: "ℑ", emptyset: "∅",
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε", zeta: "ζ", eta: "η", theta: "θ",
  vartheta: "ϑ", iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π", rho: "ρ", sigma: "σ",
  tau: "τ", upsilon: "υ", phi: "φ", varphi: "φ", chi: "χ", psi: "ψ", omega: "ω", Gamma: "Γ", Delta: "Δ", Theta: "Θ",
  Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
  quad: " ", qquad: "  ", ",": " ", ";": " ", ":": " ", "!": "", " ": " ", "%": "%", $: "$", "&": "&", "#": "#",
  _: "_", "{": "{", "}": "}", "|": "|", backslash: "\\", lbrace: "{", rbrace: "}", langle: "⟨", rangle: "⟩",
  lceil: "⌈", rceil: "⌉", lfloor: "⌊", rfloor: "⌋",
};

const SUP: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻",
  "=": "⁼", "(": "⁽", ")": "⁾", n: "ⁿ", i: "ⁱ", x: "ˣ", y: "ʸ", a: "ᵃ", b: "ᵇ", c: "ᶜ", d: "ᵈ", e: "ᵉ", k: "ᵏ", m: "ᵐ",
  t: "ᵗ", "°": "°",
};
const SUB: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉", "+": "₊", "-": "₋",
  "=": "₌", "(": "₍", ")": "₎", a: "ₐ", e: "ₑ", i: "ᵢ", j: "ⱼ", k: "ₖ", m: "ₘ", n: "ₙ", o: "ₒ", p: "ₚ", r: "ᵣ", s: "ₛ",
  t: "ₜ", u: "ᵤ", v: "ᵥ", x: "ₓ",
};

/** Reads a `{...}` group (or a single token) starting at `i`; returns the inner text and the index after it. */
function group(src: string, i: number): [string, number] {
  if (src[i] === "{") {
    let depth = 0;
    for (let j = i; j < src.length; j++) {
      if (src[j] === "{") depth++;
      else if (src[j] === "}") {
        depth--;
        if (depth === 0) return [src.slice(i + 1, j), j + 1];
      }
    }
    return [src.slice(i + 1), src.length];
  }
  if (src[i] === "\\") {
    const m = /^\\([A-Za-z]+|.)/.exec(src.slice(i));
    if (m) return [m[0], i + m[0].length];
  }
  return [src[i] ?? "", Math.min(i + 1, src.length)];
}

function script(inner: string, table: Record<string, string>, mark: string): string {
  const plain = mathToPlain(inner);
  const mapped = [...plain].map((ch) => table[ch]);
  if (plain && mapped.every((c) => c !== undefined)) return mapped.join("");
  return `${mark}${plain.length > 1 ? `(${plain})` : plain}`;
}

const wrap = (s: string) => (/^[\w.]+$/.test(s) ? s : `(${s})`);

/** `$17 \times 23$` → `17 × 23`; `\frac{1}{2}` → `1/2`; `x^{2}` → `x²`; unknown commands lose the backslash. */
export function mathToPlain(tex: string): string {
  let out = "";
  let i = 0;
  while (i < tex.length) {
    const ch = tex[i]!;
    if (ch === "\\") {
      const m = /^\\([A-Za-z]+|.)/.exec(tex.slice(i));
      const name = m?.[1] ?? "";
      i += 1 + name.length;
      if (name === "frac" || name === "dfrac" || name === "tfrac") {
        const [a, j] = group(tex, i);
        const [b, k] = group(tex, j);
        out += `${wrap(mathToPlain(a))}/${wrap(mathToPlain(b))}`;
        i = k;
      } else if (name === "sqrt") {
        let root = "";
        if (tex[i] === "[") {
          const end = tex.indexOf("]", i);
          root = tex.slice(i + 1, end < 0 ? tex.length : end);
          i = end < 0 ? tex.length : end + 1;
        }
        const [a, j] = group(tex, i);
        const inner = mathToPlain(a);
        out += `${root ? script(root, SUP, "^") : ""}√${wrap(inner)}`;
        i = j;
      } else if (name === "text" || name === "mathrm" || name === "mathbf" || name === "mathit" || name === "textbf" || name === "operatorname" || name === "mathcal" || name === "boldsymbol") {
        const [a, j] = group(tex, i);
        out += name === "text" ? a : mathToPlain(a);
        i = j;
      } else if (name === "left" || name === "right" || name === "displaystyle" || name === "limits" || name === "nolimits" || name === "big" || name === "Big" || name === "bigl" || name === "bigr") {
        if (tex[i] === ".") i++;
      } else if (name === "overline" || name === "bar" || name === "vec" || name === "hat" || name === "underline") {
        const [a, j] = group(tex, i);
        out += mathToPlain(a);
        i = j;
      } else if (name in SYMBOLS) {
        out += SYMBOLS[name];
      } else {
        out += name;
      }
      continue;
    }
    if (ch === "^" || ch === "_") {
      const [a, j] = group(tex, i + 1);
      out += script(a, ch === "^" ? SUP : SUB, ch);
      i = j;
      continue;
    }
    if (ch === "{" || ch === "}") {
      i++;
      continue;
    }
    if (ch === "~") {
      out += " ";
      i++;
      continue;
    }
    out += ch;
    i++;
  }
  return out.replace(/[ \t]{2,}/g, " ").trim();
}
