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
            // Anchor the TS parser to this package so it doesn't try to infer a
            // root across the monorepo's multiple tsconfigs (which throws
            // "No tsconfigRootDir was set" in editors run from the repo root).
            parserOptions: {
                tsconfigRootDir: import.meta.dirname,
            },
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
