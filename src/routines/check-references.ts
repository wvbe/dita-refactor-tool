import { evaluateXPathToFirstNode, evaluateXPathToNodes, evaluateXPathToString } from 'fontoxpath';
import inquirer from 'inquirer';
import { Element } from 'slimdom';
import { FileCache } from '../util/dom-caching';
import { getAllXmlFileNames } from '../util/globbing';
import { info, prefix, success, warn } from '../util/pretty-logging';
import { Sitemap } from '../util/sitemap';
import { posix as path } from 'path';
// Register XPath functions:
import '../util/xpath';

type FixOptions = {
	nonInteractive: boolean;
	fixDocumentNotFound: boolean;
	fixElementNotFound: boolean;
	fixTextNotMatch: boolean;
};

/**
 * Returns a file:line:column string for (the start of) the link text, in a syntax that VS Code
 * will pick up on when clicked in the terminal.
 */
function formatClickableName(filePath: string, referrerElement: Element) {
	const {
		line,
		column
	}: {
		line: number;
		column: number;
		start: number;
		end: number;
	} = ((evaluateXPathToFirstNode('./text()', referrerElement) ||
		referrerElement) as any).position;
	return `${filePath}:${line}:${column}`;
}
type Prompt = {
	code: string;
	keys: (string | null)[];
	question: string;
	print: () => void;
	options: {
		label: string;
		xquf?: string;
		variables?: Record<string, any>;
	}[];
};
async function checkOneReference(
	fileCache: FileCache,
	referrerFilePath: string,
	referrerElement: Element,
	options: FixOptions,
	sitemapNodes: string[] | null
): Promise<false | Prompt> {
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
		const nerfs = fileCache
			.keys()
			.filter(k => path.basename(k) === path.basename(targetFilePath));
		return (
			options.fixDocumentNotFound && {
				code: 'doc-not-found',
				keys: [targetFilePath],
				question: `How proceed?`,
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
					},
					...nerfs.map(suggestedFilePath => ({
						label: `Update to point to "${suggestedFilePath}"`,
						xquf: `
							replace
								value of node $node/@href
							with
								Q{https://github.com/wvbe/dita-refactor-tool}create-relative-reference($self, $filePath)
						`,
						variables: {
							self: referrerFilePath,
							node: referrerElement,
							filePath: suggestedFilePath
						}
					}))
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
				code: 'element-not-found',
				keys: [targetFilePath, targetIdentifier],
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

	if (sitemapNodes && !sitemapNodes.includes(targetFilePath)) {
		return {
			code: 'document-not-in-map',
			keys: [targetFilePath],
			question: `How proceed?`,
			print: () => {
				warn(`The referenced document is not in the DITAMAP.`);
				prefix('Referring file', clickableReferrerLink);
				prefix('Link target   ', targetFilePath);
				prefix('Link text     ', `"${referenceText}"`);
				prefix('Target title  ', `"${targetTitleText}"`);
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
		};
	}

	if (targetTitleText === referenceText) {
		// Refernce text matches the target, no further improvements to suggest
		return false;
	}

	return (
		options.fixTextNotMatch && {
			code: 'text-not-match',
			keys: [targetFilePath, targetIdentifier].filter(Boolean),
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

async function checkAllReferencesInFile(
	fileCache: FileCache,
	filePath: string,
	fixOptions: FixOptions,
	previouslyAnswered: PreviousAnswerRegistry<number>,
	sitemapNodes: string[] | null
) {
	const dom = await fileCache.getDocument(filePath);
	const references = evaluateXPathToNodes(
		`//*[
			@href and
			@format="dita"
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
			fixOptions,
			sitemapNodes
		);
		if (!suggestion) {
			return true;
		}

		info('');
		suggestion.print();

		const previousAnswer = previouslyAnswered.get([suggestion.code, ...suggestion.keys]);
		const { response } = await inquirer.prompt([
			{
				message: suggestion.question,
				name: 'response',
				type: 'list',
				choices: [
					previousAnswer === undefined
						? new inquirer.Separator(`Repeat last`)
						: {
								name: `Repeat last (${suggestion.options[previousAnswer].label})`,
								value: suggestion.options[previousAnswer]
						  },
					...suggestion.options.map(option => ({
						name: option.label,
						value: option
					}))
				]
			}
		]);

		previouslyAnswered.set(
			[suggestion.code, ...suggestion.keys],
			suggestion.options.indexOf(response) as number
		);

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

	return wasUpdated;
}

class PreviousAnswerRegistry<P> {
	remembered: Record<string, P> = {};
	private getKey(keys: (string | null)[]) {
		return keys.join('/');
	}
	public set(keys: (string | null)[], answer: P) {
		this.remembered[this.getKey(keys)] = answer;
	}
	public get(keys: (string | null)[]): P | undefined {
		return this.remembered[this.getKey(keys)];
	}
}

export async function checkReferences(
	fileCache: FileCache,
	{
		projectRoot,
		rootFilePath,
		...fixOptions
	}: {
		projectRoot: string | null;
		rootFilePath: string | null;
	} & FixOptions
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

	let sitemapFilePaths: string[] | null = null;
	if (rootFilePath) {
		const sitemap = rootFilePath ? new Sitemap(fileCache, rootFilePath) : null;
		info('Indexing DITAMAP...');
		sitemapFilePaths = [
			...((await sitemap?.getMaps()) || []),
			...((await sitemap?.getNodes()) || []).map(node => node.target)
		].filter((x): x is string => Boolean(x));
	}
	const previouslyAnswered = new PreviousAnswerRegistry<number>();
	for await (const filePath of fileCache.keys()) {
		await checkAllReferencesInFile(
			fileCache,
			filePath,
			fixOptions,
			previouslyAnswered,
			sitemapFilePaths
		);
	}

	info('');
	success(`Done, all changes saved.`);
}
