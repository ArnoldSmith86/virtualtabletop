/*
 * For a detailed explanation regarding each configuration property, visit:
 * https://jestjs.io/docs/en/configuration.html
 */

export default {
  coverageDirectory: "coverage",
  coverageProvider: "v8",
  projects: ["<rootDir>/client"],
  setupFilesAfterEnv: ['<rootDir>/tests/client/setup.js'],
  testEnvironment: "jest-environment-jsdom-global",
  verbose: true
};
