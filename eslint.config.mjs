import js from "@eslint/js";
import tseslint from "typescript-eslint";
export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/dist/**", "**/.expo/**", "**/web-build/**", "apps/mobile/public/wllama/**", "apps/mobile/ios/**", "apps/mobile/android/**", "apps/desktop/src-tauri/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { rules: { "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }] } },
  { files: ["**/*.cjs", "**/*.mjs", "**/*.js"], languageOptions: { globals: { process: "readonly", console: "readonly", require: "readonly", module: "writable", __dirname: "readonly", Buffer: "readonly", setTimeout: "readonly", fetch: "readonly", navigator: "readonly", performance: "readonly", document: "readonly" } }, rules: { "@typescript-eslint/no-require-imports": "off" } }
);
