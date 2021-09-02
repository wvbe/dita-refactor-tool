#!/usr/bin/env node

const { Command } = require('ask-nicely');
const { checkReferences, error } = require('../dist');
const { fileCache } = require('./util/fileCache');

new Command('check-references')
	.addOption('fix-document-not-found')
	.addOption('fix-element-not-found')
	.addOption('fix-text-not-match')
	.addOption('fix-document-not-in-map')
	.addOption('fix-all')
	.addOption('non-interactive', 'I')
	.setController(({ parameters, options }) =>
		checkReferences(fileCache, {
			projectRoot: process.cwd(),
			nonInteractive: options['non-interactive'],
			rootFilePath:
				typeof options['fix-document-not-in-map'] === 'string'
					? options['fix-document-not-in-map'] || null
					: null,
			fixDocumentNotFound: options['fix-document-not-found'] || options['fix-all'],
			fixElementNotFound: options['fix-element-not-found'] || options['fix-all'],
			fixTextNotMatch: options['fix-text-not-match'] || options['fix-all']
		})
	)
	.execute(process.argv.slice(2))
	.catch(err => {
		error('Unexpected fatal error, stopping program');
		error('----');
		error(err.stack);
		process.exit();
	});
