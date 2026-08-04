import globals from "globals";

export default [
  {
    ignores: ["dist/**", "node_modules/**", "test-results/**", "tests/e2e/**"],
  },
  {
    files: ["js/**/*.js", "tvkit/js/**/*.js"],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "module",
      globals: {
        ...globals.browser,
        PalmServiceBridge: "readonly",
        webOS: "readonly",
      },
    },
    rules: {
      "no-undef": "error",
      "no-unreachable": "error",
      "no-constant-condition": "error",
      "no-dupe-keys": "error",
      "no-redeclare": "error",
      "no-unused-vars": ["error", { args: "after-used", caughtErrors: "none" }],
    },
  },
  {
    files: ["scripts/**/*.mjs", "tests/**/*.mjs", "tvkit/tests/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      "no-undef": "error",
      "no-unreachable": "error",
      "no-dupe-keys": "error",
      "no-redeclare": "error",
      "no-unused-vars": "off",
    },
  },
];
