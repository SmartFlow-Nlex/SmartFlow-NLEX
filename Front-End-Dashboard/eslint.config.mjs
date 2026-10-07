import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

/*
 * ESLint 9 flat config.
 *
 * The project declared ESLint 9 but configured it through .eslintrc.json, which
 * version 9 no longer reads. `next build` lints anyway, because Next shims the
 * old format internally — so the rules were being enforced and nobody noticed
 * that the standalone step was broken. Running `npx eslint .` failed outright
 * with "couldn't find an eslint.config file", which matters because Section
 * 3.13 (Software Quality Assurance) describes a standalone lint step as part of
 * the process.
 *
 * eslint-config-next does not yet ship a flat entry point, so the two shareable
 * configs are brought across with FlatCompat. The rule set is therefore exactly
 * what .eslintrc.json selected — this migration changes how the config is
 * loaded, not what is checked.
 */
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  {
    // Flat config has no .eslintignore; ignores live here. Build output and the
    // static export are generated, and linting them reports thousands of
    // problems in code nobody wrote.
    ignores: [
      ".next/**",
      "out/**",
      "node_modules/**",
      "public/**",
      "dist/**",
      "next-env.d.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    /*
     * The Electron main process and its preload script are CommonJS by
     * requirement, not by preference: Electron loads electron/main.js — the
     * "main" entry in package.json — as CJS, and a preload script runs in the
     * same world. Rewriting either as ESM would stop the desktop app starting,
     * so require() is correct there and the rule is turned off for that folder
     * rather than the calls being worked around.
     */
    files: ["electron/**/*.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
];

export default config;
