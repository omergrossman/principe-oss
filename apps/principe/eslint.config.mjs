// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // Advisory rule that fires on idiomatic mount effects (browser feature
      // detection, fetch-on-mount, init-from-URL). Keep it visible as a
      // warning rather than blocking CI — these usages are intentional.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
