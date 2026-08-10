import eslintPluginUnicorn from "eslint-plugin-unicorn";
import globals from "globals";
import tseslint from "typescript-eslint";

const controlFlowRules = {
  complexity: ["error", 15],
  curly: ["error", "all"],
  eqeqeq: ["error", "always"],
  "max-depth": ["error", 3],
  "max-nested-callbacks": ["error", 3],
  "no-else-return": ["error", { allowElseIf: false }],
  "no-lonely-if": "error",
};

export default tseslint.config(
  {
    ignores: [".astro-stage/**", "dist/**", "node_modules/**", "templates/**"],
  },
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ["src/js/**/*.ts"],
  })),
  {
    files: ["src/js/**/*.ts"],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      unicorn: eslintPluginUnicorn,
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "all",
          argsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      ...controlFlowRules,
      "unicorn/prefer-node-protocol": "warn",
    },
  },
  {
    files: ["src/js/**/*.js"],
    languageOptions: {
      globals: globals.browser,
    },
    rules: controlFlowRules,
  },
  {
    files: ["astro.config.mjs", "scripts/*.mjs"],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      curly: ["error", "all"],
      eqeqeq: ["error", "always"],
    },
  },
);
