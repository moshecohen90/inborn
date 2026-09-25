import js from "@eslint/js";
import tseslint from "typescript-eslint";
export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/dist/**", "**/.expo/**", "**/web-build/**", "apps/mobile/public/wllama/**", "apps/mobile/public/pdfjs/**", "apps/mobile/ios/**", "apps/mobile/android/**", "apps/desktop/src-tauri/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { rules: { "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }] } },
  /* F401: a bare Modal ignores Esc for its first 250 ms on the web; AppModal is the one wrapper that closes it from the first frame. */
  { files: ["apps/mobile/src/**/*.{ts,tsx}"], ignores: ["apps/mobile/src/components/shell/AppModal.tsx"], rules: { "no-restricted-imports": ["error", { paths: [{ name: "react-native", importNames: ["Modal"], message: "Use AppModal (components/shell/AppModal) so Esc closes it from the first frame." }, { name: "react-native-web", importNames: ["Modal"], message: "Use AppModal." }] }] } },
  { files: ["**/*.cjs", "**/*.mjs", "**/*.js"], languageOptions: { globals: { process: "readonly", console: "readonly", require: "readonly", module: "writable", __dirname: "readonly", Buffer: "readonly", setTimeout: "readonly", fetch: "readonly", navigator: "readonly", performance: "readonly", document: "readonly", localStorage: "readonly" } }, rules: { "@typescript-eslint/no-require-imports": "off" } }
);
