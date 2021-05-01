import glob from 'glob';

export async function getAllXmlFileNames(cwd: string): Promise<string[]> {
	const options = {
		cwd: cwd,
		dot: false,
		strict: true,
		nodir: true,
		ignore: 'node_modules/**/*.xml'
	};
	const matches = await new Promise<string[]>((resolve, reject) =>
		glob('**/*.xml', options, (err, matches) => (err ? reject(err) : resolve(matches)))
	);
	return matches;
}
