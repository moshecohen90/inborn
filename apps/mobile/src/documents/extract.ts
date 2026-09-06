import { DocxExtractor, ExtractError, TextFileExtractor, type DocKind, type DocSource, type Ocr, type OpenedDocument, type TextExtractor } from "@inborn/core";
import { readBytes } from "./files";

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
let pdfjs: Promise<PdfJs> | null = null;

/* The worker file is copied next to the bundle by `pnpm wasm` (apps/mobile/package.json); pdf.js never fetches fonts or cmaps here. */
async function loadPdfJs(): Promise<PdfJs> {
  return (pdfjs ??= import("pdfjs-dist/legacy/build/pdf.mjs").then((m) => {
    m.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
    return m;
  }));
}

/** Web + desktop: pdf.js in the page (spec §5.5 "Web/Desktop pdf.js"); no network, the file is a local Blob. */
export class PdfJsExtractor implements TextExtractor {
  supports(kind: DocKind): boolean {
    return kind === "pdf";
  }

  async open(source: DocSource): Promise<OpenedDocument> {
    const lib = await loadPdfJs();
    const data = await readBytes(source.uri);
    if (!data.length) throw new ExtractError("empty");
    let doc;
    try {
      doc = await lib.getDocument({ data, isEvalSupported: false, disableFontFace: true, useSystemFonts: false, stopAtErrors: true }).promise;
    } catch (e: unknown) {
      const name = (e as { name?: string }).name;
      if (name === "PasswordException") throw new ExtractError("encrypted", "password-protected PDF");
      throw new ExtractError("corrupt", e instanceof Error ? e.message : "cannot parse PDF");
    }
    return {
      pages: doc.numPages,
      page: async (index) => {
        const page = await doc.getPage(index + 1);
        const content = await page.getTextContent();
        let text = "";
        let lastY: number | null = null;
        for (const item of content.items) {
          if (!("str" in item)) continue;
          const y = item.transform[5] as number;
          if (lastY !== null && Math.abs(y - lastY) > 2) text += "\n";
          else if (text && !text.endsWith(" ") && !text.endsWith("\n")) text += " ";
          text += item.str;
          lastY = y;
        }
        page.cleanup();
        return { page: index + 1, text, needsOcr: !text.trim() };
      },
      close: () => doc.destroy(),
    };
  }
}

export function createExtractors(): TextExtractor[] {
  return [new PdfJsExtractor(), new TextFileExtractor(readBytes), new DocxExtractor(readBytes)];
}

/** No OCR in the browser tier yet (Tesseract.js ships in a later milestone); scans are reported as "needs OCR". */
export function nativeOcr(): Ocr | null {
  return null;
}
