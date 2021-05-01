const path = require('path');
const fs = require('fs-extra');
const { FileCache } = require('../../dist');

module.exports = {
	fileCache: new FileCache({
		resolve: name => path.join(process.cwd(), name),
		fetch: async name => fs.readFile(name, 'utf8'),
		push: async (name, contents) => fs.writeFile(name, contents, 'utf8'),
		exists: async name => new Promise((res) => fs.exists(name, result => res(result))),
		move: async (filePath, newFilePath) => fs.move(filePath, newFilePath, { overwrite: false })
	})
};
