/**
 * HTML → text without a DOM: scripts, styles and hidden elements are dropped, headings keep a "#" mark, list items a
 * bullet or number, table cells a " | ", so the chunker sees the page's structure. Sections cut at h1–h3 become the
 * "§" pages a citation points at. Nothing here fetches a linked resource.
 */
import { ExtractError, type DocSource, type ExtractedPage, type OpenedDocument, type TextExtractor } from "../types";
import { decodeText, paginate, TEXT_PAGE_CHARS } from "./text";

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", copy: "©", reg: "®", trade: "™", hellip: "…", mdash: "—", ndash: "–",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", laquo: "«", raquo: "»", bull: "•", middot: "·", times: "×", divide: "÷", euro: "€",
  pound: "£", yen: "¥", cent: "¢", deg: "°", sect: "§", para: "¶", shy: "", zwj: "", zwnj: "", ensp: " ", emsp: " ", thinsp: " ",
};

export function decodeHtml(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : Number(body.slice(1));
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return NAMED[body] ?? NAMED[body.toLowerCase()] ?? m;
  });
}

/** Whole subtrees that are never content. */
const SKIP = new Set(["script", "style", "noscript", "template", "svg", "iframe", "object", "canvas", "head", "select", "textarea", "button"]);
const KEEP_IN_HEAD = new Set(["title"]);
const BLOCK = new Set(["p", "div", "section", "article", "header", "footer", "main", "aside", "nav", "blockquote", "pre", "address", "figure", "figcaption", "form", "fieldset", "table", "thead", "tbody", "tfoot", "ul", "ol", "dl", "dt", "dd", "hr", "details", "summary", "center"]);
const VOID = new Set(["br", "hr", "img", "input", "meta", "link", "area", "base", "col", "embed", "source", "track", "wbr", "param"]);

const hidden = (tag: string): boolean => /\shidden(?:[\s>=/]|$)/i.test(tag) || /\baria-hidden="true"/i.test(tag) || /style="[^"]*display\s*:\s*none/i.test(tag);

/** Markup → text. Headings → "# …", li → "• …" / "n. …", td/th → " | ", block ends → newlines. */
export function htmlToText(html: string): string {
  let out = "";
  const lists: { ordered: boolean; n: number }[] = [];
  let skip: { name: string; depth: number } | null = null;
  let inHead = false;
  let inTitle = false;
  let pre = 0;
  let cellsInRow = 0;
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<\?[^>]*>|<\/?([a-zA-Z][a-zA-Z0-9:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>|[^<]+|</g;
  const newline = (n = 1) => {
    out = out.replace(/[ \t]+$/, "");
    const trailing = /\n*$/.exec(out)?.[0].length ?? 0;
    if (trailing < n) out += "\n".repeat(n - trailing);
  };
  for (const m of html.matchAll(re)) {
    const tok = m[0];
    if (tok.startsWith("<!") || tok.startsWith("<?")) continue;
    const name = m[1]?.toLowerCase();
    if (name === undefined) {
      if (skip || (inHead && !inTitle)) continue;
      const text = decodeHtml(tok);
      if (pre) out += text;
      else if (!/^\s*$/.test(text) || !/(?:^|\n)$/.test(out)) out += text.replace(/[ \t\r\n\f]+/g, " ");
      continue;
    }
    const closing = tok[1] === "/";
    if (skip) {
      if (name === skip.name) {
        if (closing) {
          skip.depth--;
          if (skip.depth === 0) skip = null;
        } else if (!tok.endsWith("/>")) skip.depth++;
      }
      continue;
    }
    if (name === "head") {
      inHead = !closing;
      continue;
    }
    if (inHead && !KEEP_IN_HEAD.has(name)) continue;
    if (!closing) {
      if (SKIP.has(name) || hidden(tok)) {
        if (!VOID.has(name) && !tok.endsWith("/>")) skip = { name, depth: 1 };
        continue;
      }
      if (name === "br") newline();
      else if (name === "img") {
        const alt = /\salt="([^"]*)"/i.exec(tok)?.[1];
        if (alt?.trim()) out += `${/(?:^|\s)$/.test(out) ? "" : " "}${decodeHtml(alt.trim())} `;
      } else if (/^h[1-6]$/.test(name)) {
        newline(2);
        out += `${"#".repeat(Number(name[1]))} `;
      } else if (name === "ul" || name === "ol") {
        newline();
        lists.push({ ordered: name === "ol", n: Number(/\sstart="(\d+)"/.exec(tok)?.[1] ?? 1) - 1 });
      } else if (name === "li") {
        newline();
        const list = lists[lists.length - 1];
        if (list?.ordered) out += `${++list.n}. `;
        else out += "• ";
      } else if (name === "tr") {
        newline();
        cellsInRow = 0;
      } else if (name === "td" || name === "th") {
        if (cellsInRow++) out += " | ";
      } else if (name === "title") {
        newline(2);
        out += "# ";
        inTitle = true;
      } else if (name === "pre") {
        newline();
        pre++;
      } else if (BLOCK.has(name)) newline(name === "p" || name === "blockquote" || name === "table" ? 2 : 1);
    } else {
      if (/^h[1-6]$/.test(name) || name === "title") {
        inTitle = false;
        newline(2);
      } else if (name === "ul" || name === "ol") {
        lists.pop();
        newline();
      } else if (name === "pre") {
        pre = Math.max(0, pre - 1);
        newline();
      } else if (name === "li" || name === "tr") newline();
      else if (BLOCK.has(name)) newline(name === "p" || name === "blockquote" || name === "table" ? 2 : 1);
    }
  }
  return out
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Sections start at h1–h3; a section longer than a text page is cut like a TXT file; no headings → plain pagination. */
export function htmlSections(text: string): string[] {
  const parts = text.split(/\n(?=#{1,3} )/).filter((p) => p.trim());
  if (parts.length < 2) return paginate(text);
  return parts.flatMap((p) => paginate(p.trim(), TEXT_PAGE_CHARS));
}

export class HtmlExtractor implements TextExtractor {
  constructor(private readonly readBytes: (uri: string) => Promise<Uint8Array>) {}

  supports(kind: DocSource["kind"]): boolean {
    return kind === "html";
  }

  async open(source: DocSource): Promise<OpenedDocument> {
    const bytes = await this.readBytes(source.uri);
    if (!bytes.length) throw new ExtractError("empty");
    const pages = htmlSections(htmlToText(decodeText(bytes)));
    return {
      pages: pages.length,
      page: async (i): Promise<ExtractedPage> => ({ page: i + 1, text: pages[i] ?? "", needsOcr: false }),
      close: async () => undefined,
    };
  }
}
