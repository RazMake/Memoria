import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            // Allow explicit `any` in telemetry bridge code and test mocks —
            // the codebase already minimises usage (only 2 occurrences in source).
            "@typescript-eslint/no-explicit-any": "warn",

            // Unused vars are errors, but allow underscore-prefixed names for
            // intentional placeholders (e.g., _event in callbacks).
            "@typescript-eslint/no-unused-vars": [
                "error",
                { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
            ],

            // require() is used intentionally for lazy-loading @vscode/extension-telemetry
            // to avoid bundling its CJS transitive dependencies.
            "@typescript-eslint/no-require-imports": "off",

            // Prefer const for variables that are never reassigned.
            "prefer-const": "error",

            // Disallow fall-through in switch statements.
            "no-fallthrough": "error",

            // Warn on console usage — extension code should use OutputChannel or telemetry.
            "no-console": "warn",
        },
    },
    {
        // Test files can use any, non-null assertions, etc. freely.
        files: ["../tests/**/*.ts"],
        rules: {
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-non-null-assertion": "off",
        },
    },
    {
        ignores: [
            "dist/",
            "coverage/",
            "node_modules/",
            ".vscode-test/",
            // Config files are plain JS/MJS outside the TypeScript project.
            "esbuild.config.mjs",
            "eslint.config.mjs",
            ".vscode-test.mjs",
        ],
    },
);
