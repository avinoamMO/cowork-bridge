module.exports = {
  testMatch: ['**/tests/**/*.test.js'],
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['bridge.js'],
  forceExit: true,
  testTimeout: 10000,
};
