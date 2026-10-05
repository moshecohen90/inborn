import { DocxExtractor, ExtractError, HtmlExtractor, TextFileExtractor, XlsxExtractor, type DocKind, type DocSource, type Ocr, type OpenedDocument, type TextExtractor } from "@inborn/core";
import { closePdf, hasDocExtract, ocrEngine, ocrLanguages, openPdf, pageInk, pageText, recognizeText, renderPage } from "../../modules/doc-extract";
import { DEV_AUTOOCR } from "./devFlags";
import { readBytes } from "./files";

const reasonOf = (e: unknown): ExtractError => {
  const code = (e as { code?: string }).code ?? "";
  const msg = e instanceof Error ? e.message : String(e);
  if (code === "ERR_ENCRYPTED") return new ExtractError("encrypted", msg);
  if (code === "ERR_EMPTY") return new ExtractError("empty", msg);
  return new ExtractError("corrupt", msg);
};

/** PDFs through the native module (PDFKit / pdfbox-android); pages are read one at a time. */
export class NativePdfExtractor implements TextExtractor {
  supports(kind: DocKind): boolean {
    return kind === "pdf" && hasDocExtract();
  }

  async open(source: DocSource): Promise<OpenedDocument & { render: (index: number) => Promise<string> }> {
    let opened;
    try {
      opened = await openPdf(source.uri);
    } catch (e: unknown) {
      throw reasonOf(e);
    }
    const id = opened.id;
    return {
      pages: opened.pages,
      page: async (index) => {
        const r = await pageText(id, index);
        return { page: index + 1, text: r.text, needsOcr: r.needsOcr };
      },
      render: (index) => renderPage(id, index, 2),
      close: () => closePdf(id),
    };
  }
}

/** A photo or scan is a one-page document whose only content comes from OCR. */
export class ImageExtractor implements TextExtractor {
  supports(kind: DocKind): boolean {
    return kind === "image";
  }

  async open(source: DocSource): Promise<OpenedDocument & { render: (index: number) => Promise<string> }> {
    return { pages: 1, page: async () => ({ page: 1, text: "", needsOcr: true }), render: async () => source.uri, close: async () => undefined };
  }
}

export const hasPageRenderer = (): boolean => hasDocExtract();

async function withPdf<T>(uri: string, use: (id: string) => Promise<T>): Promise<T> {
  const { id } = await openPdf(uri);
  try {
    return await use(id);
  } finally {
    await closePdf(id).catch(() => undefined);
  }
}

/** How much of a page is pictures rather than paper (`pagePhoto.ts`); `page` is 1-based. */
export const pageInkAt = (uri: string, page: number): Promise<number> => withPdf(uri, (id) => pageInk(id, page - 1));

/** A PNG of the page in the cache directory; the caller imports it as a photo and deletes it. */
export const renderPageAt = (uri: string, page: number): Promise<string | null> => withPdf(uri, (id) => renderPage(id, page - 1, 2));

export function createExtractors(): TextExtractor[] {
  return [new NativePdfExtractor(), new ImageExtractor(), new TextFileExtractor(readBytes), new DocxExtractor(readBytes), new XlsxExtractor(readBytes), new HtmlExtractor(readBytes)];
}

/** Dev proofs (simulator, no readable console): the last reads land in Documents/dev-run.json next to the document stats. */
export const devOcrReads: { engine: string; confidence: number; text: string }[] = [];

/** iOS Vision (+ Tesseract for scripts Vision lacks) / Android Tesseract, all on the device; null when the native module is missing (Expo Go). */
export function nativeOcr(): Ocr | null {
  if (!hasDocExtract()) return null;
  return {
    id: ocrEngine(),
    languages: ocrLanguages,
    recognize: async (image, languages) => {
      const r = await recognizeText(image, languages);
      if (DEV_AUTOOCR) devOcrReads.push({ engine: (r as { engine?: string }).engine ?? ocrEngine(), confidence: r.confidence, text: r.text.slice(0, 400) });
      return r;
    },
  };
}
