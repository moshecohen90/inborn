import type { TextStyle } from "react-native";
import { citationLabel, hasRtl, isolateName, type Citation, type PageWords } from "@inborn/core";

export { isolateName };

const LTR: TextStyle = { writingDirection: "ltr" };

/** A line that shows a file name stays an LTR line: first-strong would turn "קובץ.pdf" into an RTL line reading "pdf.קובץ" (iOS, and dir="auto" on web). */
export const nameLine = (text: string): TextStyle | undefined => (hasRtl(text) ? LTR : undefined);

/** A source chip's label for the screen; the prompt keeps the plain `citationLabel`. */
export const shownCitationLabel = (c: Pick<Citation, "docName" | "kind" | "page" | "pageTo">, words: PageWords): string => citationLabel({ ...c, docName: isolateName(c.docName) }, words);
