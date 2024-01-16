module.exports = {
  roots: ['<rootDir>/scripts'],
  testMatch: ['**/*.test.ts'],
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.ts$': [
      '@swc/jest',
    ],
  },
  resetMocks: true,
}