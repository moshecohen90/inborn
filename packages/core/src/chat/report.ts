import type { Report, ReportInput } from "./types";

/** The plain-text body of an emailed report (§8.2 S13): what the user chose to include, nothing else. */
export function reportText(report: ReportInput | Report, at: number = "createdAt" in report ? report.createdAt : Date.now()): string {
  return [`Inborn report · ${new Date(at).toISOString()}`, `Reason: ${report.reason}`, report.note ? `Note: ${report.note}` : "", report.modelId ? `Model: ${report.modelId}` : "", report.messageText ? `\nMessage:\n${report.messageText}` : ""].filter(Boolean).join("\n");
}

/** Bytes a saved report occupies, for the Settings list. */
export const reportBytes = (report: Report): number => new TextEncoder().encode(report.note + (report.messageText ?? "")).length;
