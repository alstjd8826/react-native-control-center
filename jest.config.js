/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/', '/lib/', '/__fixtures__/'],
  collectCoverageFrom: ['src/**/*.ts', 'core/**/*.ts', 'plugin/**/*.ts', 'cli/**/*.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
};
