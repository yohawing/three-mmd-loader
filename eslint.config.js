import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "deploy/**",
      "native/bullet/dist/**",
      "native/third_party/**",
      "scripts/local/oracle/**",
      "src/parser/wasm/generated/**",
      "third_party/**"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module"
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-import-type-side-effects": "error",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-non-null-assertion": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }
      ]
    }
  },
  {
    files: ["*.mjs", "scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        URL: "readonly",
        TextDecoder: "readonly",
        TextEncoder: "readonly",
        WebAssembly: "readonly",
        console: "readonly",
        performance: "readonly",
        process: "readonly"
      }
    }
  },
  {
    files: ["scripts/expose-memory.js"],
    languageOptions: {
      globals: {
        HEAP32: "readonly",
        HEAPU32: "readonly",
        HEAPF32: "readonly",
        HEAPU8: "readonly",
        HEAPU16: "readonly",
        Module: "readonly"
      }
    }
  },
  {
    files: ["src/parser/wasm/**/*.ts", "test/wasm/**/*.ts"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off"
    }
  },
  {
    files: ["examples/**/*.js"],
    languageOptions: {
      globals: {
        HTMLCanvasElement: "readonly",
        HTMLInputElement: "readonly",
        URL: "readonly",
        console: "readonly",
        document: "readonly",
        fetch: "readonly",
        location: "readonly",
        window: "readonly"
      }
    }
  }
);
