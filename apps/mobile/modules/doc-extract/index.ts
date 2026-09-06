import { requireOptionalNativeModule } from "expo";

/** Page text from the native PDF stack: PDFKit on iOS, pdfbox-android on Android. */
export interface NativePageText {
  text: string;
  /** No text layer on the page (a scan); the caller may render + OCR it. */
  needsOcr: boolean;
}

export interface NativeOpened {
  id: string;
  pages: number;
}

export interface NativeOcrResult {
  text: string;
  confidence: number;
}

interface NativeDocExtract {
  /** Opens a PDF; rejects with code ERR_ENCRYPTED / ERR_CORRUPT. */
  openPdf(path: string): Promise<NativeOpened>;
  pageText(id: string, index: number): Promise<NativePageText>;
  /** Renders one page to a PNG in the cache directory at `scale` × 72 dpi and returns its file URI. */
  renderPage(id: string, index: number, scale: number): Promise<string>;
  closePdf(id: string): Promise<void>;
  /** BCP-47 tags the on-device OCR can read (iOS Vision) or Tesseract language codes bundled with the app (Android). */
  ocrLanguages(): Promise<string[]>;
  /** Text recognition on an image file, fully on the device. */
  recognizeText(imageUri: string, languages: string[]): Promise<NativeOcrResult>;
  /** "vision" | "tesseract"; tells the details screen what read the scan. */
  ocrEngine(): string;
}

const native = requireOptionalNativeModule<NativeDocExtract>("DocExtract");

export const hasDocExtract = (): boolean => native !== null;

function must(): NativeDocExtract {
  if (!native) throw new Error("DocExtract native module unavailable");
  return native;
}

export const openPdf = (path: string): Promise<NativeOpened> => must().openPdf(path);
export const pageText = (id: string, index: number): Promise<NativePageText> => must().pageText(id, index);
export const renderPage = (id: string, index: number, scale = 2): Promise<string> => must().renderPage(id, index, scale);
export const closePdf = (id: string): Promise<void> => must().closePdf(id);
export const ocrLanguages = (): Promise<string[]> => (native ? native.ocrLanguages() : Promise.resolve([]));
export const recognizeText = (imageUri: string, languages: string[]): Promise<NativeOcrResult> => must().recognizeText(imageUri, languages);
export const ocrEngine = (): string => native?.ocrEngine() ?? "none";
