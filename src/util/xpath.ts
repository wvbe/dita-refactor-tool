import path from 'path';
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

		const joined = path.posix.join(path.posix.dirname(referrer), target);
		return joined;
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
