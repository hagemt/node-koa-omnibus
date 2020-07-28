/* eslint-env node */
module.exports = {
	env: {
		es6: true,
		mocha: true,
		node: true,
	},

	extends: [
		'eslint:recommended',
		'plugin:import/recommended',
		'plugin:mocha/recommended',
		'plugin:node/recommended',
		'plugin:prettier/recommended',
		'prettier',
	],

	parserOptions: {
		ecmaVersion: 2017,
	},

	plugins: ['mocha', 'import', 'node', 'prettier'],

	root: true,

	rules: {
		'import/unambiguous': ['off'],
		'sort-keys': ['warn'],
	},
}
