import js from "@eslint/js"
import jsdoc from "eslint-plugin-jsdoc"
import stylistic from "@stylistic/eslint-plugin"
import globals from "globals"

export default [
  js.configs.recommended,
  jsdoc.configs['flat/recommended'], {
    name: "gesslar/uglier/ignores",
    ignores: [],
  }, {
    name: "gesslar/uglier/languageOptions",
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
        fetch: "readonly",
        Headers: "readonly",
      },
    },
  },
  // Add override for webview files to include browser globals
  {
    name: "gesslar/uglier/webview-env",
    files: ["src/webview/**/*.{js,mjs,cjs}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        acquireVsCodeApi: "readonly"
      }
    }
  },
  // Add override for .cjs files to treat as CommonJS
  {
    name: "gesslar/uglier/cjs-override",
    files: ["src/**/*.cjs"],
    languageOptions: {
      sourceType: "script",
      ecmaVersion: 2021
    },
  },
  // Add override for .mjs files to treat as ES modules
  {
    name: "gesslar/uglier/mjs-override",
    files: ["src/**/*.mjs"],
    languageOptions: {
      sourceType: "module",
      ecmaVersion: 2021
    }
  },
  {
    name: "gesslar/uglier/lints-js",
    files: ["{work,src}/**/*.{mjs,cjs,js}"],
    plugins: {
      "@stylistic": stylistic,
    },
    rules: {
      "@stylistic/arrow-parens": ["error", "as-needed"],
      "@stylistic/arrow-spacing": ["error", { before: true, after: true }],
      "@stylistic/brace-style": ["error", "1tbs", {allowSingleLine: false}],
      "@stylistic/nonblock-statement-body-position": ["error", "below"],
      "@stylistic/padding-line-between-statements": [
        "error",
        {blankLine: "always",   prev: "if", next: "*"},
        {blankLine: "always",   prev: "*", next: "return"},
        {blankLine: "always",   prev: "while", next: "*"},
        {blankLine: "always",   prev: "for", next: "*"},
        {blankLine: "always",   prev: "switch", next: "*"},
        {blankLine: "always",   prev: "do", next: "*"},
        // {blankLine: "always",   prev: ["const", "let", "var"], next: "*"},
        // {blankLine: "any",      prev: ["const", "let", "var"], next: ["const", "let", "var"]},
        {blankLine: "always",   prev: "directive", next: "*" },
        {blankLine: "any",      prev: "directive", next: "directive" },
      ],
      "@stylistic/eol-last": ["error", "always"],
      "@stylistic/indent": ["error", 2, {
        SwitchCase: 1 // Indents `case` statements one level deeper than `switch`
      }],
      "@stylistic/key-spacing": ["error", { beforeColon: false, afterColon: true }],
      "@stylistic/keyword-spacing": ["error", {
        before: false,
        after: true,
        overrides: {
          // Control statements
          return:  { before: true, after: true },
          if:      { after: false },
          else:    { before: true, after: true },
          for:     { after: false },
          while:   { before: true, after: false },
          do:      { after: true },
          switch:  { after: false },
          case:    { before: true, after: true },
          throw:   { before: true, after: false } ,

          // Keywords
          as:      { before: true, after: true },
          of:      { before: true, after: true },
          from:    { before: true, after: true },
          async:   { before: true, after: true },
          await:   { before: true, after: false },
          class:   { before: true, after: true },
          const:   { before: true, after: true },
          let:     { before: true, after: true },
          var:     { before: true, after: true },

          // Exception handling
          catch:   { before: true, after: true },
          finally: { before: true, after: true },
        }
      }],
      // Blocks
      "@stylistic/space-before-blocks": ["error", "always"],
      "@stylistic/max-len": ["warn", {
        code: 80,
        ignoreComments: true,
        ignoreUrls: true,
        ignoreStrings: true,
        ignoreTemplateLiterals: true,
        ignoreRegExpLiterals: true,
        tabWidth: 2
      }],
      "@stylistic/no-tabs": "error",
      "@stylistic/no-trailing-spaces": ["error"],
      "@stylistic/object-curly-spacing": ["error", "never", {
        objectsInObjects: false,
        arraysInObjects: false
      }],
      "@stylistic/quotes": ["error", "double", {
        avoidEscape: true,
        allowTemplateLiterals: "always"
      }],
      "@stylistic/semi": ["error", "never"],
      "@stylistic/space-before-function-paren": ["error", "never"],
      "@stylistic/yield-star-spacing": ["error", { before: true, after: false }],
      "constructor-super": "error",
      "no-unexpected-multiline": "error",
      "no-unused-vars": ["error", {
        caughtErrors: "all",
        caughtErrorsIgnorePattern: "^_+",
        argsIgnorePattern: "^_+",
        destructuredArrayIgnorePattern: "^_+",
        varsIgnorePattern: "^_+"
      }],
      "no-useless-assignment": "error",
      "prefer-const": "error",
      "@stylistic/no-multiple-empty-lines": ["error", { max: 1 }],
      "@stylistic/array-bracket-spacing": ["error", "never"],
    }
  },
  {
    name: "gesslar/uglier/lints-jsdoc",
    files: ["{work,src}/**/*.{mjs,cjs,js}"],
    plugins: {
      jsdoc,
    },
    rules: {
      "jsdoc/require-description": "error",
      "jsdoc/tag-lines": ["error", "any", {"startLines":1}],
      "jsdoc/require-jsdoc": ["error", { publicOnly: true }],
      "jsdoc/check-tag-names": "error",
      "jsdoc/check-types": "error",
      "jsdoc/require-param-type": "error",
      "jsdoc/require-returns-type": "error"
    }
  }
]
