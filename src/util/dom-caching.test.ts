import { describe, expect, it } from '@jest/globals';
import fs from 'fs-extra';
import path from 'path';
import { FileCache } from './dom-caching';

const mockFileRead = jest.fn<Promise<string>, [string, string]>((name, options) =>
	fs.readFile(name, options)
);

describe('FileCache', () => {
	const fileCache = new FileCache({
		resolve: name => path.join(__dirname, '__data__', name),
		fetch: async name => (await mockFileRead(name, 'utf8')).toString(),
		push: async () => { },
		exists: async () => true,
		move: async () => {},
	});

	it('Minimizes time spent reading from disk', async () => {
		await fileCache.getDocument('dom-caching.test.xml');
		await fileCache.getDocument('dom-caching.test.xml');
		expect(mockFileRead.mock.calls).toHaveLength(1);
	});
});
