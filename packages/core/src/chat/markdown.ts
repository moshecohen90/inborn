/**
 * Small Markdown parser for chat answers (§7.1, §9.6). Produces a block tree the renderer draws with native
 * text; links stay text (never opened, no network), images become a text placeholder, math becomes plain Unicode.
 * Streaming rule (§9.6): an unclosed fence is a plain text block until the closing fence arrives.
 */

import { mathToPlain } from "./math";

export type Inline =
  | { type: "text"; text: string }
  | { type: "strong"; children: Inline[] }
  | { type: "em"; children: Inline[] }
  | { type: "strike"; children: Inline[] }
  | { type: "code"; text: string }
  | { type: "math"; text: string }
  | { type: "link"; children: Inline[]; url: string }
  | { type: "br" };

export type ListItem = { children: Block[] };

export type Block =
  | { type: "paragraph"; children: Inline[] }
  | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; children: Inline[] }
  | { type: "code"; lang: string; text: string; open: boolean }
  | { type: "list"; ordered: boolean; start: number; items: ListItem[] }
  | { type: "quote"; children: Block[] }
  | { type: "table"; header: Inline[][]; align: ("left" | "center" | "right" | null)[]; rows: Inline[][][] }
  | { type: "hr" }
  | { type: "math"; text: string };

const FENCE = /^(\s{0,3})(`{3,}|~{3,})\s*([^\s`]*)\s*$/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const BULLET = /^(\s*)([-*+])\s+(.*)$/;
const ORDERED = /^(\s*)(\d{1,9})[.)]\s+(.*)$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

/** Display math opens with `$$` or `\\[` on its own line (models emit both). */
function mathOpener(line: string): "$$" | "\\[" | null {
  const t = line.trim();
  return t.startsWith("$$") ? "$$" : t.startsWith("\\[") ? "\\[" : null;
}

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  return parseBlocks(lines);
}

function parseBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[2]!;
      const lang = fence[3] ?? "";
      const body: string[] = [];
      let j = i + 1;
      let closed = false;
      for (; j < lines.length; j++) {
        const l = lines[j]!;
        if (l.trim().startsWith(marker[0]!.repeat(marker.length)) && l.trim().replace(/`|~/g, "") === "") {
          closed = true;
          break;
        }
        body.push(l);
      }
      blocks.push({ type: "code", lang: lang.toLowerCase(), text: body.join("\n"), open: !closed });
      i = closed ? j + 1 : lines.length;
      continue;
    }
    const opener = mathOpener(line);
    if (opener) {
      const closer = opener === "$$" ? "$$" : "\\]";
      const rest = line.trim().slice(2);
      if (rest.endsWith(closer) && rest.length >= 2) {
        blocks.push({ type: "math", text: mathToPlain(rest.slice(0, -2)) });
        i++;
        continue;
      }
      const body: string[] = rest ? [rest] : [];
      let j = i + 1;
      let closed = false;
      for (; j < lines.length; j++) {
        const l = lines[j]!;
        if (l.trim().endsWith(closer)) {
          const head = l.trim().slice(0, -2);
          if (head) body.push(head);
          closed = true;
          break;
        }
        body.push(l);
      }
      if (closed) {
        blocks.push({ type: "math", text: mathToPlain(body.join("\n")) });
        i = j + 1;
        continue;
      }
    }
    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1]!.length as 1 | 2 | 3 | 4 | 5 | 6, children: parseInline(heading[2]!) });
      i++;
      continue;
    }
    if (HR.test(line)) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }
    if (QUOTE.test(line)) {
      const inner: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i]!)) inner.push(QUOTE.exec(lines[i++]!)![1]!);
      blocks.push({ type: "quote", children: parseBlocks(inner) });
      continue;
    }
    if (isTableStart(lines, i)) {
      const header = splitRow(lines[i]!).map(parseInline);
      const align = splitRow(lines[i + 1]!).map((c) => {
        const t = c.trim();
        const l = t.startsWith(":");
        const r = t.endsWith(":");
        return l && r ? "center" : r ? "right" : l ? "left" : null;
      });
      const rows: Inline[][][] = [];
      let j = i + 2;
      for (; j < lines.length && lines[j]!.includes("|") && lines[j]!.trim(); j++) {
        const cells = splitRow(lines[j]!).map(parseInline);
        while (cells.length < header.length) cells.push([]);
        rows.push(cells.slice(0, header.length));
      }
      blocks.push({ type: "table", header, align, rows });
      i = j;
      continue;
    }
    const list = BULLET.exec(line) ?? ORDERED.exec(line);
    if (list) {
      const ordered = !BULLET.test(line);
      const indent = list[1]!.length;
      const start = ordered ? Number(list[2]) : 1;
      const items: ListItem[] = [];
      while (i < lines.length) {
        const l = lines[i]!;
        const m = ordered ? ORDERED.exec(l) : BULLET.exec(l);
        if (!m || m[1]!.length !== indent) break;
        const own: string[] = [m[3]!];
        i++;
        // Continuation lines indented deeper than the marker belong to this item (nested lists, wrapped text).
        while (i < lines.length) {
          const next = lines[i]!;
          if (!next.trim()) {
            const after = lines[i + 1];
            if (after !== undefined && after.trim() && leading(after) > indent) {
              own.push("");
              i++;
              continue;
            }
            break;
          }
          const nm = BULLET.exec(next) ?? ORDERED.exec(next);
          if (nm && nm[1]!.length <= indent) break;
          if (!nm && leading(next) <= indent && !own[own.length - 1]?.length) break;
          own.push(next.slice(Math.min(leading(next), indent + 2)));
          i++;
        }
        items.push({ children: parseBlocks(own) });
      }
      blocks.push({ type: "list", ordered, start, items });
      continue;
    }
    const para: string[] = [line];
    i++;
    while (i < lines.length && lines[i]!.trim() && !startsBlock(lines, i)) para.push(lines[i++]!);
    blocks.push({ type: "paragraph", children: parseInline(para.join("\n")) });
  }
  return blocks;
}

const leading = (s: string): number => s.length - s.trimStart().length;

function startsBlock(lines: string[], i: number): boolean {
  const l = lines[i]!;
  return FENCE.test(l) || HEADING.test(l) || HR.test(l) || QUOTE.test(l) || BULLET.test(l) || ORDERED.test(l) || isTableStart(lines, i) || mathOpener(l) !== null;
}

function isTableStart(lines: string[], i: number): boolean {
  const a = lines[i];
  const b = lines[i + 1];
  return !!a && !!b && a.includes("|") && TABLE_SEP.test(b) && b.includes("-") && splitRow(a).length === splitRow(b).length;
}

function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = "";
  let inCode = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === "`") inCode = !inCode;
    if (ch === "\\" && s[i + 1] === "|") {
      cur += "|";
      i++;
      continue;
    }
    if (ch === "|" && !inCode) {
      cells.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

// Inline

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let text = "";
  const flush = () => {
    if (text) out.push({ type: "text", text });
    text = "";
  };
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (ch === "\\" && src[i + 1] === "(") {
      const close = src.indexOf("\\)", i + 2);
      if (close > i + 2) {
        flush();
        out.push({ type: "math", text: mathToPlain(src.slice(i + 2, close)) });
        i = close + 2;
        continue;
      }
    }
    if (ch === "\\" && i + 1 < src.length && /[\\`*_~[\]()#$|]/.test(src[i + 1]!)) {
      text += src[i + 1];
      i += 2;
      continue;
    }
    if (ch === "\n") {
      flush();
      out.push({ type: "br" });
      i++;
      continue;
    }
    if (ch === "`") {
      let n = 1;
      while (src[i + n] === "`") n++;
      const close = src.indexOf("`".repeat(n), i + n);
      if (close > 0) {
        flush();
        out.push({ type: "code", text: src.slice(i + n, close).replace(/\n/g, " ") });
        i = close + n;
        continue;
      }
    }
    if (ch === "$" && src[i + 1] !== "$" && src[i + 1] !== " ") {
      const close = src.indexOf("$", i + 1);
      if (close > i + 1 && src[close - 1] !== " " && !/\d/.test(src[close + 1] ?? "")) {
        flush();
        out.push({ type: "math", text: mathToPlain(src.slice(i + 1, close)) });
        i = close + 1;
        continue;
      }
    }
    if (ch === "!" && src[i + 1] === "[") {
      const link = readLink(src, i + 1);
      if (link) {
        text += `[image: ${link.label || link.url}]`;
        i = link.end;
        continue;
      }
    }
    if (ch === "[") {
      const link = readLink(src, i);
      if (link) {
        flush();
        out.push({ type: "link", children: parseInline(link.label), url: link.url });
        i = link.end;
        continue;
      }
    }
    const wrap = ch === "*" || ch === "_" || ch === "~" ? readEmphasis(src, i) : null;
    if (wrap) {
      flush();
      out.push({ type: wrap.type, children: parseInline(wrap.inner) });
      i = wrap.end;
      continue;
    }
    text += ch;
    i++;
  }
  flush();
  return mergeText(out);
}

function readLink(src: string, at: number): { label: string; url: string; end: number } | null {
  let depth = 0;
  let j = at;
  for (; j < src.length; j++) {
    if (src[j] === "[") depth++;
    else if (src[j] === "]") {
      depth--;
      if (depth === 0) break;
    }
  }
  if (j >= src.length || src[j + 1] !== "(") return null;
  const close = src.indexOf(")", j + 2);
  if (close < 0) return null;
  const target = src.slice(j + 2, close).trim();
  const url = target.split(/\s+/)[0] ?? "";
  if (/\n/.test(target)) return null;
  return { label: src.slice(at + 1, j), url, end: close + 1 };
}

function readEmphasis(src: string, at: number): { type: "strong" | "em" | "strike"; inner: string; end: number } | null {
  const ch = src[at]!;
  const double = src[at + 1] === ch;
  const marker = double ? ch + ch : ch;
  const next = src[at + marker.length];
  if (next === undefined || /\s/.test(next)) return null;
  if (ch === "~" && !double) return null;
  // Intra-word underscores (snake_case) are not emphasis.
  if (ch === "_" && at > 0 && /[\p{L}\p{N}]/u.test(src[at - 1]!)) return null;
  let j = at + marker.length;
  while (j < src.length) {
    const close = src.indexOf(marker, j);
    if (close < 0) return null;
    const before = src[close - 1]!;
    const after = src[close + marker.length];
    const wordAfter = after !== undefined && /[\p{L}\p{N}]/u.test(after);
    if (!/\s/.test(before) && !(ch === "_" && wordAfter) && close > at + marker.length) {
      return { type: double ? (ch === "~" ? "strike" : "strong") : "em", inner: src.slice(at + marker.length, close), end: close + marker.length };
    }
    j = close + marker.length;
  }
  return null;
}

function mergeText(nodes: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const n of nodes) {
    const last = out[out.length - 1];
    if (n.type === "text" && last?.type === "text") last.text += n.text;
    else out.push(n);
  }
  return out;
}

/** Spoken/plain form of inline content (screen readers, snippets, copy of a cell). */
export function inlineToText(nodes: readonly Inline[]): string {
  return nodes
    .map((n) => {
      switch (n.type) {
        case "text":
        case "code":
        case "math":
          return n.text;
        case "br":
          return "\n";
        case "link":
          return `${inlineToText(n.children)} (${n.url})`;
        default:
          return inlineToText(n.children);
      }
    })
    .join("");
}

/** Whole answer as speakable text, Markdown syntax removed (§10.8 #54). */
export function markdownToText(src: string): string {
  return blocksToText(parseMarkdown(src)).trim();
}

function blocksToText(blocks: readonly Block[]): string {
  return blocks
    .map((b) => {
      switch (b.type) {
        case "paragraph":
        case "heading":
          return inlineToText(b.children);
        case "code":
          return b.text;
        case "math":
          return b.text;
        case "hr":
          return "";
        case "quote":
          return blocksToText(b.children);
        case "list":
          return b.items.map((it, i) => `${b.ordered ? `${b.start + i}.` : "•"} ${blocksToText(it.children).trim()}`).join("\n");
        case "table":
          return [b.header, ...b.rows].map((r) => r.map(inlineToText).join(" | ")).join("\n");
      }
    })
    .join("\n\n");
}
