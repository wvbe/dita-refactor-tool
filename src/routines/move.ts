import inquirer from 'inquirer';
import path from 'path';

import { FileCache } from '../util/dom-caching';
import { getAllXmlFileNames } from '../util/globbing';

import { info, warn, success, error, prefix } from '../util/pretty-logging';

// Register XPath functions:
import '../util/xpath';

export async function move(
	fileCache: FileCache,
	targetFileInput: string,
	destinationFileInput: string,
	{ nonInteractive, projectRoot }: { nonInteractive: boolean; projectRoot: string | null }
) {
	async function validateTargetName(input?: string) {
		if (!input) {
			return `A target file is required, "${input}" was given.`;
		}
		if (!(await fileCache.existsFile(input))) {
			return `File target "${input}" does not exist`;
		}
		return true;
	}

	async function validateDestinationName(input?: string) {
		if (!input) {
			return `A destination is required, "${input}" was given.`;
		}
		if (await fileCache.existsFile(input)) {
			return `File destination "${input}" already exists`;
		}
		return true;
	}

	/**
	 * Show the intent so a user can verify it
	 */
	info(`Moving an XML file, and updating references:`);

	let targetFile: undefined | string, destinationFile: undefined | string;

	const targetFileValid = await validateTargetName(targetFileInput);
	if (targetFileValid === true) {
		targetFile = targetFileInput;
	} else if (nonInteractive) {
		throw new Error(targetFileValid);
	} else {
		error(targetFileValid);
	}
	const destinationFileValid = await validateDestinationName(destinationFileInput);
	if (destinationFileValid === true) {
		destinationFile = destinationFileInput;
	} else if (nonInteractive) {
		throw new Error(destinationFileValid);
	} else {
		error(destinationFileValid);
	}

	if (!nonInteractive) {
		const files = {
			targetFile: targetFile,
			destinationFile: destinationFile,
			...(await inquirer.prompt<{
				// Typed as optional, because the  property values are not returned
				targetFile?: string;
				destinationFile?: string;
			}>(
				[
					{
						name: 'targetFile',
						type: 'input',
						message: 'Move which file?',
						default: targetFileInput,
						// when: async () => !targetFileInput || !(await fileCache.existsFile(targetFileInput)),
						validate: validateTargetName
					},
					{
						name: 'destinationFile',
						type: 'input',
						message: 'Move to where?',
						default: destinationFileInput,
						// when: async () =>
						// 	!destinationFileInput || (await fileCache.existsFile(destinationFileInput)),
						validate: validateDestinationName
					}
				],
				{
					targetFile,
					destinationFile
				}
			))
		};
		targetFile = files.targetFile || targetFile;
		destinationFile = files.destinationFile || destinationFile;
	}

	// Posi
	targetFile = (targetFile as string).replace(/\\/g, '/');
	destinationFile = (destinationFile as string).replace(/\\/g, '/');

	prefix('Project    ', projectRoot);
	prefix('Target     ', path.join(process.cwd(), targetFile));
	prefix('Destination', path.join(process.cwd(), destinationFile));

	/**
	 * Look up the changes that need to be made
	 */
	if (projectRoot) {
		info('Googling project files...');
		(await getAllXmlFileNames(projectRoot)).forEach(fileName =>
			fileCache.discoverFile(fileName)
		);
	}
	const allFiles = fileCache.keys();
	info(`Create Pending updates list over ${allFiles.length} files...`);
	const pendingUpdates = await Promise.all(
		fileCache.keys().map(async filePath => ({
			filePath,
			...(await fileCache.updateDocument(
				filePath,
				`
					declare namespace drt="https://github.com/wvbe/dita-refactor-tool";
					let $references := //(@href|@conref)[
						fn:starts-with(drt:resolve-relative-reference($self, .), $target)
					]
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
	warn(
		`About to make ${attributesTouched} changes across ${filesTouched} out of ${allFiles.length} files.`
	);
	if (!nonInteractive) {
		const answer = await inquirer.prompt({
			type: 'confirm',
			name: 'proceed',
			message: `Do you want to continue?`
		});

		/**
		 * Make changes
		 */
		if (!answer.proceed) {
			warn(`Aborting move, no changes have been made.`);
			return;
		}
	} else {
		info(`Skip confirmation step.`);
	}

	info(`Updating inbound references...`);
	await Promise.all(
		pendingUpdates
			.filter(({ pendingUpdateList }) => pendingUpdateList.length)
			.map(async ({ filePath, execute }) => {
				await execute();
				return fileCache.writeFile(filePath);
			})
	);

	info(`Moving file...`);
	await fileCache.moveFile(targetFile, destinationFile);

	info(`Updating outbound references...`);
	const { execute } = await fileCache.updateDocument(
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
	await fileCache.writeFile(destinationFile);

	success(`Done, all changes saved.`);
}
