/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'jsdom',
  testMatch: ['**/tests/unit/**/*.test.js'],
  verbose: true,
  collectCoverageFrom: [
    'utils.js',
    'TextBox.js',
    'Connection.js',
    'MindMap.js',
  ],
};
