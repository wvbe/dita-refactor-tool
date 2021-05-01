import { evaluateUpdatingExpression, executePendingUpdateList } from 'fontoxpath';
import { Node, serializeToWellFormedString } from 'slimdom';
import { sync } from 'slimdom-sax-parser';

export type FileCacheOptions = {
	resolve: (filePath: string) => string;
	fetch: (filePath: string) => Promise<string>;
	push: (filePath: string, contents: string) => Promise<void>;
};

export class FileCache {
	private stringByName: { [filePath: string]: string | null } = {};
	private domByFileName: { [filePath: string]: Document } = {};
	private options: FileCacheOptions;

	constructor(options: FileCacheOptions) {
		this.options = options;
	}

	public knowsAbout(filePath: string): boolean {
		return !!this.stringByName[filePath];
	}

	public async getString(filePath: string): Promise<string> {
		if (!this.stringByName[filePath] && this.domByFileName[filePath]) {
			// This cache was removed after getDocument returned it (after which it may have been changed by reference).
			this.injectString(
				filePath,
				serializeToWellFormedString((this.domByFileName[filePath] as unknown) as Node)
			);
		}

		if (!this.stringByName[filePath]) {
			// Either this thing was never fetched before, or someone botched busting the cache
			const resolvedFilePath = this.options.resolve(filePath);
			this.injectString(filePath, await this.options.fetch(resolvedFilePath));
		}

		return this.stringByName[filePath] as string;
	}

	public async getDocument(filePath: string): Promise<Document> {
		// NOTE caching on the filePath key, not a resolved file path. This is probably fine for a while.
		if (this.domByFileName[filePath]) {
			return this.domByFileName[filePath];
		}

		const fetchedContent = await this.getString(filePath);

		this.domByFileName[filePath] = (sync(fetchedContent) as unknown) as Document;

		// The DOM may be changed after it is returned, so unset that cache and let getString serialize the DOm back
		// to a string next thime it is asked.
		this.stringByName[filePath] = null;

		return this.domByFileName[filePath];
	}

	public injectString(filePath: string, contents: string) {
		this.stringByName[filePath] = contents;
	}
	public async updateDocument(
		filePath: string,
		updateQuery: string,
		variables: Record<string, any>
	) {
		const { pendingUpdateList } = await evaluateUpdatingExpression(
			updateQuery,
			await this.getDocument(filePath),
			null,
			variables || {},
			{
				debug: true
			}
		);

		let executed = false;
		return {
			pendingUpdateList,
			execute: () => {
				if (executed) {
					throw new Error(`Cannot execute pending update list twice`);
				}
				executed = true;
				return executePendingUpdateList(pendingUpdateList);
			}
		};
	}

	public bustFile(filePath: string): void {
		delete this.stringByName[filePath];
		delete this.domByFileName[filePath];
	}

	public async writeFile(filePath: string, contents?: Document): Promise<void> {
		const dom = contents || (await this.getDocument(filePath));
		return this.options.push(filePath, serializeToWellFormedString((dom as unknown) as Node));
	}
}
