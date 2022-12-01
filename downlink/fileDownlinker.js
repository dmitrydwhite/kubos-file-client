const { Duplex } = require('stream');
const cbor = require('cbor');
const FileImportReceiver = require("./FileImportReceiver");

/**
 * @param {string} storagePath The local location where the downlinked file will be stored
 * @param {string} targetPath The location where the file is currently located on the remote system
 * @param {Duplex} source The Node.js stream over which the transfer will take place
 * @returns {Promise<string>}
 */
const fileDownlinker = (storagePath, targetPath, source, opts = {}) => new Promise((resolve, reject) => {
	if (typeof storagePath !== 'string') {
		return reject(new Error(`storagePath must be a string; got ${typeof storagePath} ${storagePath}`));
	}

	if (typeof targetPath !== 'string') {
		return reject(new Error(`targetPath must be a string; got ${typeof targetPath} ${targetPath}`));
	}

	if (!(source instanceof Duplex)) {
		return reject(new Error(`source must be a Node.js Duplex stream`));
	}

	const receiver = new FileImportReceiver({ destination: storagePath, target_path: targetPath });

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
		resolve(storagePath);
	});
});

module.exports = fileDownlinker;
