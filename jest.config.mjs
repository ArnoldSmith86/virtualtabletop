/*
 * For a detailed explanation regarding each configuration property, visit:
 * https://jestjs.io/docs/en/configuration.html
 */

export default {
  coverageDirectory: "coverage",
  coverageProvider: "v8",
  projects: ["<rootDir>/client"],
  setupFilesAfterEnv: ['<rootDir>/tests/client/setup.js'],
  testEnvironment: "jsdom",
  // the server modules are tested in the jsdom environment as well, so dependencies have
  // to resolve to their node build (fflate ships an ESM-only build for browsers)
  testEnvironmentOptions: { customExportConditions: [ "node" ] },
  verbose: true
};
