const globals = require("globals");
const js = require("@eslint/js");

module.exports = [
  js.configs.recommended,

  {
    files: ["js/**/*.js", "lib/**/*.js", "tests/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.es2021,

        THREE: "readonly",
        JSZip: "readonly",
        opentype: "readonly",
        params: "readonly",
        parsedFont: "readonly",
        fontName: "readonly",
        currentFontKey: "readonly",
        scene: "readonly",
        camera: "readonly",
        renderer: "readonly",
        controls: "readonly",
        currentGroup: "readonly",
        isGridVisible: "readonly",
        isLightingMode: "readonly",
        gridHelper: "readonly",
        ambientLight: "readonly",
        dirLight1: "readonly",
        dirLight2: "readonly",
        threadStandards: "readonly",
        DEFAULT_PARAMS: "readonly"
      }
    },
    rules: {
      "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }]
    }
  },
  {
    files: ["worker.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.worker,
        ...globals.es2021,
        Response: "readonly"
      }
    },
    rules: {
      "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }]
    }
  }
];
