/*
 * For a detailed explanation regarding each configuration property, visit:
 * https://jestjs.io/docs/en/configuration.html
 */

export default {
  coverageDirectory: "coverage",
  coverageProvider: "v8",
  projects: ["<rootDir>/client"],
  testEnvironment: "jest-environment-jsdom-global"
  //testURL: "http://localhost:8272/testroom"
};
