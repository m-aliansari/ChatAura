import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
    { ignores: ["coverage"] },
    {
        files: ["**/*.{js,ts}"],
        extends: [js.configs.recommended, tseslint.configs.recommended],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: globals.node,
        },
        rules: {
            // Mirror the client's convention so intentionally-unused
            // PascalCase / CONSTANT bindings don't error.
            "@typescript-eslint/no-unused-vars": ["error", { varsIgnorePattern: "^[A-Z_]" }],
        },
    },
    // Must be LAST: disable ESLint stylistic rules that conflict with Prettier.
    prettier,
);
