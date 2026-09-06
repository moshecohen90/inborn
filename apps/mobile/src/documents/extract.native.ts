import { DocxExtractor, ExtractError, TextFileExtractor, type DocKind, type DocSource, type Ocr, type OpenedDocument, type TextExtractor } from "@inborn/core";
import { closePdf, hasDocExtract, ocrEngine, ocrLanguages, openPdf, pageText, recognizeText, renderPage } from "../../modules/doc-extract";
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

export function createExtractors(): TextExtractor[] {
  return [new NativePdfExtractor(), new ImageExtractor(), new TextFileExtractor(readBytes), new DocxExtractor(readBytes)];
}

/** iOS Vision / Android Tesseract, both on the device; null when the native module is missing (Expo Go). */
export function nativeOcr(): Ocr | null {
  if (!hasDocExtract()) return null;
  return {
    id: ocrEngine(),
    languages: ocrLanguages,
    recognize: (image, languages) => recognizeText(image, languages),
  };
}
