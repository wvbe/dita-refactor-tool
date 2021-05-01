import { describe, expect, it } from '@jest/globals';
import path from 'path';
import { FileCache } from '../util/dom-caching';
import { move } from './move';

describe('Move routine', () => {
	const fileCache: FileCache = new FileCache({
		resolve: p => path.join(__dirname, '__data__', p),
		fetch: () => {
			throw new Error('Never');
		},
		exists: async n => fileCache.knowsAbout(n),
		push: async () => {},
		move: async () => {}
	});

	fileCache.injectString(
		'map.xml',
		`<map><topicref href="file1.xml"/><topicref href="file2.xml"/></map>`
	);
	fileCache.injectString('file1.xml', `<file/>`);
	fileCache.injectString('file2.xml', `<file><xref href="file1.xml"/></file>`);
	fileCache.injectString('file3.xml', `<file><xref href="file1.xml"/></file>`);
	it('Moo', async () => {
		await move(fileCache, 'file1.xml', 'file1-moved.xml', {
			nonInteractive: true,
			projectRoot: null
		});
		expect(await fileCache.getString('map.xml')).toBe(
			`<map><topicref href="file1-moved.xml"/><topicref href="file2.xml"/></map>`
		);
		expect(fileCache.knowsAbout('file1.xml')).toBeFalsy();
		expect(fileCache.knowsAbout('file1-moved.xml')).toBeTruthy();
	});
});
