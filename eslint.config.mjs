// eslint.config.mjs
import js from '@eslint/js';
import chaiFriendly from 'eslint-plugin-chai-friendly';
import importPlugin from 'eslint-plugin-import';
import prettierPlugin from 'eslint-plugin-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
    // Equivalent to "eslint:recommended" in flat config
    js.configs.recommended, // :contentReference[oaicite:2]{index=2}

    // TypeScript ESLint recommended (flat-config friendly)
    ...tseslint.configs.recommended, // :contentReference[oaicite:3]{index=3}
    chaiFriendly.configs.recommendedFlat,
    {
        plugins: {
            import: importPlugin,
            prettier: prettierPlugin,
            'simple-import-sort': simpleImportSort,
            'chai-friendly': chaiFriendly,
        },

        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: globals.node,
        },

        rules: {
            // Keep your existing rule intent
            '@typescript-eslint/no-explicit-any': 'off',

            // Your old "plugin:prettier/recommended" behavior
            'prettier/prettier': 'error',

            // Prefer this over import/order (better autofix, less pain)
            'simple-import-sort/imports': 'error',
            'simple-import-sort/exports': 'error',
            'no-unused-expressions': 'off', // disable original rule
            'chai-friendly/no-unused-expressions': 'error',
        },
    },

    // Ignore built output
    {
        ignores: ['dist/**', 'lib/**', 'coverage/**', '*.d.ts'],
    },
];
