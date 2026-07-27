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
    // Local build/test sandbox (core-testbed-isolation): a full copy of the app + its build
    // output, which must never be linted (or typechecked) as if it were source.
    //
    // BOTH paths are needed. `.testbed/**` only ever matched the repo root, and the sandbox
    // moved to `WORKING/.testbed` when the working folder came inside the checkout — so from
    // that point a testbed's `.next` chunks were being linted as source, adding hundreds of
    // problems that belonged to generated code. `WORKING/**` matches the .gitignore entry, so
    // anything else put in the working folder is covered too.
    ".testbed/**",
    "WORKING/**",
  ]),
  {
    // Allow intentionally-unused args/vars prefixed with _ (e.g. useActionState's
    // (prevState, formData) signature where the action ignores one of them).
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
]);

export default eslintConfig;
