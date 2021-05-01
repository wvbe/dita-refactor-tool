import path from 'path';
import fs from 'fs-extra';
import { FileCache } from './util/dom-caching';
import { registerCustomXPathFunction } from 'fontoxpath';

registerCustomXPathFunction(
	{
		namespaceURI: 'https://github.com/wvbe/dita-refactor-tool',
		localName: 'resolve-relative-reference'
	},
	['xs:string', 'xs:string'],
	'xs:string',
	(_: any, referrer: string, target: string) => {
		if (
			target.startsWith('http://') ||
			target.startsWith('https://') ||
			target.startsWith('//')
		) {
			return target;
		}
		if (target.startsWith('#')) {
			return referrer + target;
		}
		if (target === '.') {
			return referrer;
		}

		return path.posix.join(path.posix.dirname(referrer), target);
	}
);

registerCustomXPathFunction(
	{
		namespaceURI: 'https://github.com/wvbe/dita-refactor-tool',
		localName: 'create-relative-reference'
	},
	['xs:string', 'xs:string'],
	'xs:string',
	(_: any, referrer: string, target: string) => {
		if (
			target.startsWith('http://') ||
			target.startsWith('https://') ||
			target.startsWith('//')
		) {
			return target;
		}

		const rel = path.posix.relative(path.posix.dirname(referrer), target);

		return rel;
	}
);

export default new FileCache({
	resolve: name => path.join(process.cwd(), name),
	fetch: async name => fs.readFile(name, 'utf8'),
	push: async (name, contents) => fs.writeFile(name, contents, 'utf8')
});
