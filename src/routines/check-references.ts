import { evaluateXPathToFirstNode, evaluateXPathToNodes, evaluateXPathToString } from 'fontoxpath';
import inquirer from 'inquirer';
import { Element } from 'slimdom';
import { FileCache } from '../util/dom-caching';
import { getAllXmlFileNames } from '../util/globbing';
import { info, prefix, success, warn } from '../util/pretty-logging';
// Register XPath functions:
import '../util/xpath';

type FixOptions = {
	fixDocumentNotFound: boolean;
	fixElementNotFound: boolean;
	fixTextNotMatch: boolean;
};

function formatClickableName(filePath: string, el: Element) {
	const {
		line,
		column
	}: {
		line: number;
		column: number;
		start: number;
		end: number;
	} = (evaluateXPathToFirstNode('./text()', el) as any).position;
	return `${filePath}:${line}:${column}`;
}

async function checkOneReference(
	fileCache: FileCache,
	referrerFilePath: string,
	referrerElement: Element,
	options: FixOptions
) {
	const clickableReferrerLink = formatClickableName(referrerFilePath, referrerElement);
	const referenceText = evaluateXPathToString('.', referrerElement);
	const [targetFilePath, targetIdentifiers] =
		evaluateXPathToString(
			`
				Q{https://github.com/wvbe/dita-refactor-tool}resolve-relative-reference($self, @href)
			`,
			referrerElement,
			null,
			{
				self: referrerFilePath
			}
		)?.split('#') || [];
	let targetDom;
	try {
		targetDom = await fileCache.getDocument(targetFilePath);
	} catch (e) {
		return (
			options.fixDocumentNotFound && {
				question: `doc-not-found: How proceed?`,
				print: () => {
					warn(
						`The target file could not be loaded: ${e.message.substr(0, 20)}${
							e.message.length > 20 ? '…' : ''
						}`
					);
					prefix('Referring file', clickableReferrerLink);
					prefix('Link target   ', targetFilePath);
					prefix('Link text     ', `"${referenceText}"`);
				},
				options: [
					{
						label: 'Skip'
					},
					{
						label: 'Unwrap reference',
						xquf: `
							replace
								node $node
							with
								$text
						`,
						variables: {
							node: referrerElement,
							text: referenceText
						}
					}
				]
			}
		);
	}
	const targetIdentifier = targetIdentifiers?.split('/').pop() || null;
	const targetElement = targetIdentifier
		? evaluateXPathToFirstNode('//*[@id=$id]', targetDom, null, { id: targetIdentifier })
		: targetDom.documentElement;

	if (targetIdentifier && !targetElement) {
		return (
			options.fixElementNotFound && {
				question: `element-not-found: How proceed?`,
				print: () => {
					warn(`The referenced element was not found in the target document.`);
					prefix('Referring file', clickableReferrerLink);
					prefix('Link target   ', targetFilePath);
					prefix('Link element  ', targetIdentifier);
					prefix('Link text     ', `"${referenceText}"`);
				},
				options: [
					{
						label: 'Skip'
					},
					{
						label: 'Reference the whole document instead',
						xquf: `
							replace
								value of node $node/@href
							with
								Q{https://github.com/wvbe/dita-refactor-tool}create-relative-reference($self, $filePath)
						`,
						variables: {
							self: referrerFilePath,
							node: referrerElement,
							filePath: targetFilePath
						}
					},
					{
						label: 'Unwrap reference',
						xquf: `
							replace
								node $node
							with
								$text
						`,
						variables: {
							node: referrerElement,
							text: referenceText
						}
					}
				]
			}
		);
	}

	const targetTitleText = evaluateXPathToString('./title', targetElement);
	if (targetTitleText === referenceText) {
		// Refernce text matches the target, no further improvements to suggest
		return false;
	}

	return (
		options.fixTextNotMatch && {
			question: `text-not-match: How proceed?`,
			print: () => {
				warn(`The link text does not match the target title text.`);
				prefix('Referring file', clickableReferrerLink);
				prefix('Link text     ', `"${referenceText}"`);
				prefix('Target title  ', `"${targetTitleText}"`);
			},
			options: [
				{
					label: 'Skip'
				},
				{
					label: 'Update to match reference target',
					xquf: `
						replace
							value of node $node
						with
							$text
					`,
					variables: {
						node: referrerElement,
						text: targetTitleText
					}
				},
				{
					label: 'Unwrap reference',
					xquf: `
						replace
							node $node
						with
							$text
					`,
					variables: {
						node: referrerElement,
						text: referenceText
					}
				}
			]
		}
	);
}

export async function checkReferences(
	fileCache: FileCache,
	{ projectRoot, ...fixOptions }: { projectRoot: string | null } & FixOptions
) {
	/**
	 * Show the intent so a user can verify it
	 */
	info(`Checking cross references`);

	prefix('Project    ', projectRoot);

	/**
	 * Look up the changes that need to be made
	 */
	if (projectRoot) {
		info('Googling project files...');
		(await getAllXmlFileNames(projectRoot)).forEach(fileName =>
			fileCache.discoverFile(fileName)
		);
	}

	for await (const filePath of fileCache.keys()) {
		const dom = await fileCache.getDocument(filePath);
		const references = evaluateXPathToNodes(
			`//*[
				@href and
				@format="dita" and
				string(.)
			]`,
			dom
		);

		// const groupEnd = group('info', `${filePath}`);

		let wasUpdated = false;

		await references.reduce<Promise<boolean>>(async (last, referrerElement) => {
			await last;
			const suggestion = await checkOneReference(
				fileCache,
				filePath,
				(referrerElement as unknown) as Element,
				fixOptions
			);
			if (!suggestion) {
				return true;
			}

			info('');
			suggestion.print();
			const { response } = await inquirer.prompt([
				{
					message: suggestion.question,
					name: 'response',
					type: 'list',
					choices: suggestion.options.map(option => ({
						name: option.label,
						value: option
					}))
				}
			]);

			if (response.callback) {
				await response.callback();
				wasUpdated = true;
			} else if (response.xquf) {
				const { pendingUpdateList, execute } = await fileCache.updateDocument(
					filePath,
					response.xquf,
					response.variables
				);
				execute();
				wasUpdated = !!pendingUpdateList.length;
			}

			if (wasUpdated) {
				await fileCache.writeFile(filePath);
			}

			return true;
		}, Promise.resolve(true));
		// groupEnd();
	}

	info('');
	success(`Done, all changes saved.`);
}
