import {
	evaluateXPath,
	evaluateXPathToBoolean,
	evaluateXPathToNodes,
	evaluateXPathToString,
	evaluateXPathToStrings
} from 'fontoxpath';
import { FileCache } from './dom-caching';

/**
 * Represents a flat sitemap node, aka. does not have parent/child relationships. Does contain all the information
 * needed to give it a name or URL, and find its contents.
 */
export type SitemapNodeType = {
	id: string;
	navtitle: string;

	target?: string;
	resource: boolean;
};

/**
 * Hierarchical sitemap nodes.
 */
export type SitemapTreeType = SitemapNodeType & {
	children: SitemapTreeType[];
};

type MinifiedSitemapTree = number | MinifiedSitemapTree[];

// Exported for testing
export async function getUniqueMapsInTree(
	fileCache: FileCache,
	rootFilePath: string,
	forceRefresh: boolean
): Promise<string[]> {
	const knownFilePaths: string[] = [];
	const queuedFilePaths: string[] = [rootFilePath];

	let filePath;
	while ((filePath = queuedFilePaths.shift())) {
		knownFilePaths.push(filePath);
		if (forceRefresh) {
			fileCache.bustFile(filePath);
		}
		const dom = await fileCache.getDocument(filePath);
		const newFilePaths = evaluateXPathToStrings(
			'//mapref[@href]/Q{https://github.com/wvbe/dita-refactor-tool}resolve-relative-reference($self, @href)',
			dom,
			null,
			{ self: filePath }
		).filter(
			nestedFilePath =>
				!knownFilePaths.includes(nestedFilePath) &&
				!queuedFilePaths.includes(nestedFilePath)
		);
		queuedFilePaths.splice(0, 0, ...newFilePaths);
	}

	return knownFilePaths;
}

// Exported for testing
export async function getUniqueItemsFromMap(
	fileCache: FileCache,
	mapFilePath: string,
	forceRefresh: boolean
): Promise<SitemapNodeType[]> {
	if (forceRefresh) {
		fileCache.bustFile(mapFilePath);
	}
	return evaluateXPath(
		`array {
			//(topicref|topichead)/map {
				"id": string(@id),
				"navtitle": string(./topicmeta/navtitle),
				"target": if (@href)
					then Q{https://github.com/wvbe/dita-refactor-tool}resolve-relative-reference($self, @href)
					else (),
				"resource": boolean(@processing-role = 'resource-only')
			}
		}`,
		await fileCache.getDocument(mapFilePath),
		null,
		{ self: mapFilePath }
	);
}

// Exported for testing
export async function getUniqueItemsFromMaps(
	fileCache: FileCache,
	mapFilePaths: string[],
	forceRefresh: boolean
): Promise<SitemapNodeType[]> {
	const results: SitemapNodeType[] = [];
	for await (const filePath of mapFilePaths) {
		results.splice(
			results.length,
			0,
			...(await getUniqueItemsFromMap(fileCache, filePath, forceRefresh))
		);
	}
	return results;
}

// Exported for testing
export async function getItemTree<T>(
	fileCache: FileCache,
	rootFilePath: string,
	boxItem: (node: Node, children: T[]) => T[]
): Promise<T[]> {
	return (async function recurse(filePath: string, node: Document | Node): Promise<T[]> {
		if (node.nodeType === 9) {
			// If the node is the documentNode, go to the documentElement instead
			return recurse(filePath, (node as Document).documentElement);
		}
		if (evaluateXPathToBoolean('self::mapref', node)) {
			const mapRefHref = evaluateXPathToString(
				'Q{https://github.com/wvbe/dita-refactor-tool}resolve-relative-reference($self, @href)',
				node,
				null,
				{ self: filePath }
			);
			return recurse(mapRefHref, await fileCache.getDocument(mapRefHref));
		}

		const childNodes = evaluateXPathToNodes('./(topicref|topichead|mapref)', node);
		const childItems = (
			await Promise.all(childNodes.map(node => recurse(filePath, node as Node)))
		).reduce((flat: T[], item: T[]) => flat.concat(...item), []);

		return boxItem(node, childItems);
	})(rootFilePath, await fileCache.getDocument(rootFilePath));
}

// Exported for testing
export async function getExpandedItemTree(
	fileCache: FileCache,
	items: SitemapNodeType[],
	rootFilePath: string
) {
	return getItemTree<SitemapTreeType>(fileCache, rootFilePath, (node, children) => {
		if (!evaluateXPathToBoolean('self::topichead or self::topicref', node)) {
			// Some levels are invisible, such as DITAMAPs
			return children;
		}

		const id = evaluateXPathToString('@id', node) || null;
		if (!id) {
			throw new Error(`Sitemap node "${id}" was not indexed before building hierarchy`);
		}

		const item = items.find(item => item.id === id);
		if (!item) {
			return children;
		}

		return [
			{
				...item,
				children
			}
		];
	});
}

// Exported for testing
// @TODO probably remove this
export async function getCompressedItemTree(
	fileCache: FileCache,
	items: SitemapNodeType[],
	rootFilePath: string
) {
	return await getItemTree<MinifiedSitemapTree>(fileCache, rootFilePath, (node, children) => {
		if (!evaluateXPathToBoolean('self::topichead or self::topicref', node)) {
			// Some levels are invisible, such as DITAMAPs
			return children;
		}

		const id = evaluateXPathToString('@id', node) || null;
		if (!id) {
			throw new Error(`Sitemap node "${id}" was not indexed before building hierarchy`);
		}

		const index = items.findIndex(item => item.id === id);
		if (index < 0) {
			return children;
		}

		return [children.length > 0 ? [index, children] : index];
	});
}

// Exported for testing
export function extractItemTree(
	compressedItemTree: MinifiedSitemapTree,
	items: SitemapNodeType[]
): SitemapNodeType[] {
	if (!Array.isArray(compressedItemTree)) {
		compressedItemTree = [compressedItemTree];
	}
	const root = { children: [] };

	(function recurse(
		parent: {
			children: SitemapNodeType[];
		},
		level: MinifiedSitemapTree[]
	) {
		for (let i = 0; i < level.length; ++i) {
			const item = {
				...items[level[i] as number],
				children: []
			};

			if (Array.isArray(level[i + 1])) {
				recurse(item, level[++i] as MinifiedSitemapTree[]);
			}

			parent.children.push(item);
		}
	})(root, compressedItemTree);

	return root.children;
}


export class Sitemap {
	fileCache: FileCache;
	rootFilePath: string;
	mapFilePaths?: string[];
	items?: SitemapNodeType[];

	constructor(fileCache: FileCache, rootFilePath: string) {
		this.fileCache = fileCache;
		this.rootFilePath = rootFilePath;
	}

	async getMaps(forceRefresh?: boolean) {
		if (!this.mapFilePaths) {
			this.mapFilePaths = await getUniqueMapsInTree(
				this.fileCache,
				this.rootFilePath,
				!!forceRefresh
			);
		}
		return this.mapFilePaths;
	}

	/**
	 * Return a flat list of all nodes in the sitemap. Nodes do not have information wrt. their parent or children.
	 */
	public async getNodes(forceRefresh?: boolean) {
		if (!this.items) {
			this.items = await getUniqueItemsFromMaps(
				this.fileCache,
				await this.getMaps(forceRefresh),
				!!forceRefresh
			);
		}
		return this.items;
	}

	/**
	 * Get a hierarchical tree, where all nodes are organized according to their parent/children relationships.
	 */
	public async getTree() {
		return getExpandedItemTree(this.fileCache, await this.getNodes(), this.rootFilePath);
	}
}
