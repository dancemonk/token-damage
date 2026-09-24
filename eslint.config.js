import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/", "**/coverage/", "design/", "docs/"] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    // Plain JS scripts run on Node; TS files get these from @types/node.
    files: ["**/*.{js,mjs}"],
    languageOptions: {
      globals: { process: "readonly", console: "readonly", URL: "readonly" },
    },
  },
);
