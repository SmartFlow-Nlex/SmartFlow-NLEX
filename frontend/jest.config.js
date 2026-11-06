/**
 * Tests for the plain logic in lib/. Screens are not covered here (they need Skia
 * and a device), and the games have their own harness (scripts/test-*.js).
 */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/lib'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        diagnostics: false,
        tsconfig: { jsx: 'react-jsx', esModuleInterop: true, module: 'commonjs', target: 'es2020' },
      },
    ],
  },
};
