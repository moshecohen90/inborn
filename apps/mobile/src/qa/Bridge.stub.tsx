/** What every build that is not `EXPO_PUBLIC_QA=1` gets instead of the QA bridge (metro.config.js swaps the file). */
export function QaBridge(): null {
  return null;
}
