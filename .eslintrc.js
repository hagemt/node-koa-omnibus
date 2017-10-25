/* eslint-env node */
module.exports = {

	env: {
		es6: true,
	},

	extends: [
		'eslint:recommended',
		'plugin:import/recommended',
		'plugin:mocha/recommended',
	],

	parserOptions: {
		ecmaVersion: 2017,
	},

	plugins: [
		'mocha',
		'import',
	],

	rules: {
		'import/unambiguous': ['off'],
		'indent': ['error', 'tab'],
		'linebreak-style': ['error', 'unix'],
		'quotes': ['error', 'single'],
		'semi': ['error', 'never'],
	},

}
