const { Duplex } = require('stream');
const cbor = require('cbor');
const FileImportReceiver = require("./FileImportReceiver");

/**
 * @param {string} filePath
 * @param {Duplex} source
 * @returns {Promise<string>}
 */
const fileDownlinker = (filePath, source, opts = {}) => new Promise((resolve, reject) => {
	if (typeof filePath !== 'string') {
		return reject(new Error(`filePath must be a string; got ${typeof filePath} ${filePath}`));
	}

	if (!(source instanceof Duplex)) {
		return reject(new Error(`source must be a Node.js Duplex stream`));
	}

	const receiver = new FileImportReceiver({ destination: filePath });

	if (opts.noCbor) {
		source.pipe(receiver);
		receiver.pipe(source);
	} else {
		source.pipe(new cbor.Decoder()).pipe(receiver);
		receiver.pipe(new cbor.Encoder()).pipe(source);
	}

	receiver.on('error', err => {
		receiver.unpipe();
		source.unpipe();
		reject(err);
	});

	receiver.on('close', () => {
		receiver.unpipe();
		source.unpipe();
		resolve(filePath);
	});
});

module.exports = fileDownlinker;
