#!/usr/bin/env node

const { move } = require('../dist/index');

const { Command, MultiOption, Option, Parameter } = require('ask-nicely');

new Command('move')
	.addParameter('target')
	.addParameter('destination')
	.setController(({ parameters }) => move(parameters.target, parameters.destination))
	.execute(process.argv.slice(2))
	.catch(error => {
		console.log('Unexpected fatal error, stopping program');
		console.log('----');
		console.log(error.stack);
		process.exit();
	});
