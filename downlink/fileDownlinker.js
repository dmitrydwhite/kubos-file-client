const { Duplex } = require('stream');
const FileImportReceiver = require("./FileImportReceiver");

/**
 * @param {string} filePath
 * @param {Duplex} source
 * @returns {Promise<string>}
 */
const fileDownlinker = (filePath, source) => new Promise((resolve, reject) => {
	if (typeof filePath !== 'string') {
		return reject(new Error(`filePath must be a string; got ${typeof filePath} ${filePath}`));
	}

	if (!(source instanceof Duplex)) {
		return reject(new Error(`source must be a Node.js Duplex stream`));
	}

	const receiver = new FileImportReceiver({ destination: filePath });

	source.pipe(receiver);
	receiver.pipe(source);

	receiver.on('error', err => {
		receiver.unpipe(source);
		source.unpipe(receiver);
		reject(err);
	});

	receiver.on('close', () => {
		receiver.unpipe(source);
		source.unpipe(receiver);
		resolve(filePath);
	});
});

module.exports = fileDownlinker;
