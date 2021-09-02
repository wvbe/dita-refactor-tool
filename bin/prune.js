#!/usr/bin/env node

const { Command } = require('ask-nicely');
const { prune, error } = require('../dist');
const { fileCache } = require('./util/fileCache');

new Command('prune')
	.addOption('non-interactive', 'I')
	.addParameter('rootFilePath')
	.setController(({ parameters, options }) =>
		prune(fileCache, {
			projectRoot: process.cwd(),
			rootFilePath: parameters.rootFilePath
		})
	)
	.execute(process.argv.slice(2))
	.catch(err => {
		error('Unexpected fatal error, stopping program');
		error('----');
		error(err.stack);
		process.exit();
	});
