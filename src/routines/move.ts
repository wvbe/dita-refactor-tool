import chalk from 'chalk';
import fs from 'fs-extra';
import inquirer from 'inquirer';
import path from 'path';
import FILE_CACHE from '../FILE_CACHE';
import { getAllXmlFileNames } from '../util/getAllXmlFileNames';

export async function move(targetFileInput: string, destinationFileInput: string) {
	/**
	 * Show the intent so a user can verify it
	 */
	console.log(`${chalk.green('!')} Moving an XML file, and updating references:`);
	const files = await inquirer.prompt<{
		targetFile: string;
		destinationFile: string;
	}>([
		{
			name: 'targetFile',
			type: 'input',
			message: 'Move which file?',
			default: targetFileInput,
			validate: input => {
				if (!input) {
					return `Input "${input}" is not a valid file name`;
				}
				if (!fs.existsSync(input)) {
					return `File target "${input}" does not exist`;
				}
				return true;
			}
		},
		{
			name: 'destinationFile',
			type: 'input',
			message: 'Move to where?',
			default: destinationFileInput,
			validate: input => {
				if (!input) {
					return `Input "${input}" is not a valid file name`;
				}
				if (fs.existsSync(input)) {
					return `File destination "${input}" already exists`;
				}
				return true;
			}
		}
	]);

	const targetFile = files.targetFile.replace(/\\/g, '/');
	const destinationFile = files.destinationFile.replace(/\\/g, '/');
	console.log(`  ${chalk.blue('Target')}       ${path.join(process.cwd(), targetFile)}`);
	console.log(`  ${chalk.blue('Destination')}  ${path.join(process.cwd(), destinationFile)}`);

	/**
	 * Look up the changes that need to be made
	 */
	const allFiles = await getAllXmlFileNames(process.cwd());

	// Warm up the cache
	const pendingUpdates = await Promise.all(
		allFiles.map(async filePath => ({
			filePath,
			...(await FILE_CACHE.updateDocument(
				filePath,
				`
					declare namespace drt="https://github.com/wvbe/dita-refactor-tool";
					let $references := //(@href|@conref)[fn:starts-with(drt:resolve-relative-reference($self, .), $target)]
					return for $reference in $references
						let $tokens := fn:tokenize($reference, '#')
						return replace value of node $reference with fn:string-join(
							(drt:create-relative-reference($self, $destination), $tokens[2]),
							'#'
						)
				`,
				{
					self: filePath,
					target: targetFile,
					destination: destinationFile
				}
			))
		}))
	);

	/**
	 * Verify the changes before making them
	 */
	const filesTouched = pendingUpdates.filter(({ pendingUpdateList }) => pendingUpdateList.length)
		.length;
	const attributesTouched = pendingUpdates.reduce(
		(total, { pendingUpdateList }) => total + pendingUpdateList.length,
		0
	);
	const answer = await inquirer.prompt({
		type: 'confirm',
		name: 'proceed',
		message: `About to make ${attributesTouched} changes across ${filesTouched} out of ${allFiles.length} files, do you want to continue?`
	});

	/**
	 * Make changes
	 */
	if (!answer.proceed) {
		console.log(`${chalk.green('!')} Aborting move, no changes have been made.`);
	}

	console.log(`${chalk.green('!')} Moving file.`);
	await fs.move(targetFile, destinationFile, { overwrite: false });

	console.log(`${chalk.green('!')} Updating outbound references.`);
	const { execute } = await FILE_CACHE.updateDocument(
		destinationFile,
		`
			declare namespace drt="https://github.com/wvbe/dita-refactor-tool";
			let $references := //(@href|@conref)
			return for $reference in $references
				return replace value of node $reference with drt:create-relative-reference(
					$newSelf,
					drt:resolve-relative-reference($oldSelf, $reference)
				)
		`,
		{
			oldSelf: targetFile,
			newSelf: destinationFile
		}
	);
	await execute();
	await FILE_CACHE.writeFile(destinationFile);

	console.log(`${chalk.green('!')} Updating inbound references.`);
	await Promise.all(
		pendingUpdates
			.filter(({ pendingUpdateList }) => pendingUpdateList.length)
			.map(({ filePath, execute }) => {
				execute();
				FILE_CACHE.writeFile(filePath);
			})
	);

	console.log(`${chalk.green('!')} Done, all changes saved.`);
}
