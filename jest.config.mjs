/*
 * For a detailed explanation regarding each configuration property, visit:
 * https://jestjs.io/docs/en/configuration.html
 */

export default {
  coverageDirectory: "coverage",
  coverageProvider: "v8",
  projects: ["<rootDir>/client"],
  setupFiles: ['<rootDir>/tests/client/pre-setup.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/client/setup.js'],
  testEnvironment: "<rootDir>/tests/jsdom-environment.mjs",
  // the server modules are tested in the jsdom environment as well, so dependencies have
  // to resolve to their node build (fflate ships an ESM-only build for browsers) - this
  // is the default for every package the tests import, not just for fflate
  testEnvironmentOptions: { customExportConditions: [ "node" ] },
  verbose: true
};
