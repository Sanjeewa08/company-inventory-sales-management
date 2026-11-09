module.exports = {
  clearMocks: true,
  testEnvironment: "node",
  setupFiles: ["<rootDir>/test/setup.ts"],
  testMatch: ["<rootDir>/test/**/*.test.ts"],
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.json",
      },
    ],
  },
};
