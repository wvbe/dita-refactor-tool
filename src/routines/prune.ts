import { evaluateXPathToStrings } from 'fontoxpath';
import { FileCache } from '../util/dom-caching';
import { getAllXmlFileNames } from '../util/globbing';
import { info, prefix, success } from '../util/pretty-logging';
import { Sitemap } from '../util/sitemap';
// Register XPath functions:
import '../util/xpath';

export async function prune(
	fileCache: FileCache,
	{ projectRoot, rootFilePath }: { projectRoot: string; rootFilePath: string | null }
) {
	/**
	 * Show the intent so a user can verify it
	 */
	info(`Pruning obsolete content`);

	prefix('Project    ', projectRoot);

	/**
	 * Look up the changes that need to be made
	 */

	info('Googling project files...');
	(await getAllXmlFileNames(projectRoot)).forEach(fileName => fileCache.discoverFile(fileName));

	let sitemapTopicFilePaths: string[] | null = null;
	let sitemapMapFilePaths: string[] | null = null;
	if (rootFilePath) {
		const sitemap = rootFilePath ? new Sitemap(fileCache, rootFilePath) : null;
		info('Indexing DITAMAP...');
		sitemapMapFilePaths = (await sitemap?.getMaps()) || [];
		sitemapTopicFilePaths = ((await sitemap?.getNodes()) || [])
			.map(node => node.target)
			.filter((x): x is string => Boolean(x));
	}

	info('Collecting all cross-references...');
	const references = await Promise.all(
		fileCache.keys().map(async filePath => ({
			referrerFilePath: filePath,
			references: evaluateXPathToStrings(
				'//@href/Q{https://github.com/wvbe/dita-refactor-tool}resolve-relative-reference($self, .)',
				await fileCache.getDocument(filePath),
				null,
				{
					self: filePath
				}
			)
				.map(ref => ref.split('#').shift())
				.filter((ref, i, all) => all.indexOf(ref) === i)
				.sort()
		}))
	);

	for await (const filePath of fileCache.keys()) {
		const inboundReferencingFiles = references
			.filter(r => r.references.includes(filePath))
			.map(r => r.referrerFilePath);

		if (!inboundReferencingFiles.length) {
			// No inbound references
			console.log('1: ' + filePath);
			continue;
		}
		if (
			sitemapMapFilePaths &&
			!inboundReferencingFiles.some(r => (sitemapMapFilePaths as string[]).includes(r))
		) {
			// File is referenced from topic but not in any map
			console.log('2: ' + filePath);
			continue;
		}
		if (
			sitemapMapFilePaths &&
			inboundReferencingFiles.every(r => (sitemapMapFilePaths as string[]).includes(r))
		) {
			// File is referenced from map but not in any topic
			console.log('3: ' + filePath);
			continue;
		}

		if (sitemapTopicFilePaths && !sitemapTopicFilePaths.includes(filePath)) {
		}
		console.log('0: ' + filePath);
	}

	success(`Done, all changes saved.`);
}
