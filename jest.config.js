const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/src/tests/**/*.test.ts"],
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
  collectCoverageFrom: [
    "src/lexer/**/*.ts",
    "src/parser/**/*.ts",
    "src/typechecker/**/*.ts",
    "!src/**/*.d.ts"
  ],
  coverageReporters: ["text", "lcov", "html"]
};