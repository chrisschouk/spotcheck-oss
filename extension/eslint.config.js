// Flat config for ESLint v10. Replaces .eslintrc.json, which v10 no longer
// reads. Ported from the standalone spotcheck-extension repo (TOT-172), but
// kept faithful to what .eslintrc.json actually configured rather than the
// stripped-down version that repo shipped: recommended rules, the browser and
// webextension globals, and the argsIgnorePattern are all preserved.
"use strict";

const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  {
    ignores: ["node_modules/**", "dist/**", "coverage/**"],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        chrome: "readonly",
        browser: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-console": "off",
    },
  },
  {
    // Tests run under vitest in Node, not in a page.
    files: ["__tests__/**/*.js", "vitest.config.js"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.vitest,
      },
    },
  },
];
