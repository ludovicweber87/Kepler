import prettierConfig from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';

const baseConfig = [
	{
		ignores: [
			'**/node_modules/**',
			'**/dist/**',
			'**/.next/**',
			'**/build/**',
			'**/out/**',
			'eslint.config.*',
			'prettier.config.*',
			'**/next-env.d.ts',
		],
	},
	{
		settings: {
			react: {
				version: 'detect',
			},
		},
	},
	{
		plugins: {
			prettier: prettierPlugin,
		},
		rules: {
			'prettier/prettier': 'warn',
			'@typescript-eslint/no-unsafe-call': 'off',
			'@typescript-eslint/no-unsafe-return': 'off',
			'@typescript-eslint/no-unsafe-argument': 'off',
			'prefer-destructuring': 'off',
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					args: 'all',
					argsIgnorePattern: '^_',
					caughtErrors: 'all',
					caughtErrorsIgnorePattern: '^_',
					destructuredArrayIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					ignoreRestSiblings: true,
				},
			],
		},
	},
	{
		// L'hôte Electron est du CommonJS par contrat (`main` du package, pas de bundler).
		files: ['packages/desktop/**/*.js'],
		rules: { '@typescript-eslint/no-require-imports': 'off' },
	},
	prettierConfig,
];

export default baseConfig;
