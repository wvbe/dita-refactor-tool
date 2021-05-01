#!/usr/bin/env node

const { Command } = require('ask-nicely');
const { move, error } = require('../dist');
const { fileCache } = require('./util/fileCache');

new Command('move')
	.addParameter('target')
	.addParameter('destination')
	.addOption('non-interactive', 'I')
	.setController(({ parameters, options }) =>
		move(fileCache, parameters.target, parameters.destination, {
			nonInteractive: options['non-interactive'],
			projectRoot: process.cwd()
		})
	)
	.execute(process.argv.slice(2))
	.catch(err => {
		error('Unexpected fatal error, stopping program');
		error('----');
		error(err.stack);
		process.exit();
	});
