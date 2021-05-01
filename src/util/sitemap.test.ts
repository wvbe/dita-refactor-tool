import { beforeAll, describe, expect, it } from '@jest/globals';
import fs from 'fs-extra';
import path from 'path';
import { FileCache } from './dom-caching';
import { extractItemTree, getCompressedItemTree, Sitemap } from './sitemap';

describe('In sitemap.test.1.xml', () => {
	const fileCache = new FileCache({
		resolve: p => path.join(__dirname, '__data__', p),
		fetch: p => fs.readFile(p, 'utf8'),
		push: async () => {}
	});
	const sitemap = new Sitemap(fileCache, 'sitemap.test.1.xml');

	let tree: any, extracted: any;

	beforeAll(async () => {
		tree = await getCompressedItemTree(
			fileCache,
			await sitemap.getNodes(),
			'sitemap.test.1.xml'
		);
		extracted = extractItemTree(tree, await sitemap.getNodes());
	});

	it('[Sitemap#getMaps] finds the expected amount of maps', async () => {
		expect(await sitemap.getMaps()).toHaveLength(2);
	});

	it('[Sitemap#getTopics] finds the expected amount of items', async () => {
		expect(await sitemap.getNodes()).toHaveLength(9);
	});

	it('[getCompressedItemTree] returns the expected array', async () => {
		expect(tree).toEqual([
			0, //root
			[
				1, // 1
				[
					2, // 1.1
					3, // 1.2
					[
						4 // 1.2.1
					]
				],
				5, // 2
				[
					6, // 2.1
					7, // 2.2
					8 // 2.3
				]
			]
		]);
	});

	it('[Sitemap#getExpandedItemTree] returns the expected array', async () => {
		expect(await sitemap.getTree()).toMatchSnapshot();
	});

	it('[extractItemTree] extracts to the expected object', async () => {
		expect(extracted).toEqual(await sitemap.getTree());
	});
});
