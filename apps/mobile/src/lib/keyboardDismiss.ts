/** A browser blurs its field on `dismiss()` and a hardware keyboard has nothing on screen to hide, so both keep focus. */
export function dismissAfterSend(os: string, keyboard: { isVisible(): boolean; dismiss(): void }): void {
  if (os === "web" || !keyboard.isVisible()) return;
  keyboard.dismiss();
}
