module.exports = {
  parser: '@typescript-eslint/parser',
  globals: {
    global: true,
  },
  env: {
    node: true,
    'jest/globals': true,
    es2022: true
  },
  plugins: [
    'import',
    'jest',
    '@typescript-eslint',
  ],
  extends: [
    'eslint:recommended',
    'plugin:import/recommended',
    'plugin:jest/recommended',
    'plugin:jest/style',
    'plugin:@typescript-eslint/eslint-recommended',
  ],
  parserOptions: {
    sourceType: 'module'
  },
  settings: {
    'import/parsers': {
      '@typescript-eslint/parser': ['.ts']
    },
    'import/resolver': {
      'typescript': {
        'alwaysTryTypes': true, 
      }
    }
  },
  rules: {
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': 'error',
    'max-len': [
      "error", {
        'code': 120,
        'ignoreComments': true,
        'ignoreTrailingComments': true,
        'ignoreUrls': true,
        'ignoreStrings': true,
        'ignoreTemplateLiterals': true,
        'ignoreRegExpLiterals': true
      }
    ],
    'key-spacing': 'error',
    'no-trailing-spaces': 'error',
    'object-curly-spacing': [
      'error',
      'always'
    ],
    indent: [
      'error',
      2
    ],
    'linebreak-style': [
      'error',
      'unix'
    ],
    quotes: [
      'error',
      'single'
    ],
    semi: [
      'error',
      'never'
    ],
    'brace-style': [
      'error',
      'stroustrup'
    ],
    'quote-props': ['error', 'as-needed']
  }
};