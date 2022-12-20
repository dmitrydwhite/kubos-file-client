const { Duplex } = require('stream');
const cbor = require('cbor');
const FileImportReceiver = require('./FileImportReceiver');

/**
 * @param {number} channelId The unique channel ID between 100000 and 4294967296
 * @param {string} storagePath The local location where the downlinked file will be stored
 * @param {string} targetPath The location where the file is currently located on the remote system
 * @param {Duplex} source The Node.js stream over which the transfer will take place
 * @returns {Promise<string>}
 */
const fileDownlinker = (channelId, storagePath, targetPath, source, opts = {}) => new Promise((resolve, reject) => {
	const { verbose } = opts;

	if (typeof storagePath !== 'string') {
		return reject(new Error(`storagePath must be a string; got ${typeof storagePath} ${storagePath}`));
	}

	if (typeof targetPath !== 'string') {
		return reject(new Error(`targetPath must be a string; got ${typeof targetPath} ${targetPath}`));
	}

	if (!(source instanceof Duplex)) {
		return reject(new Error(`source must be a Node.js Duplex stream`));
	}

	const receiver = new FileImportReceiver({
		destination: storagePath,
		target_path: targetPath,
		channel_id: channelId,
	});

	/**
	 * @param {Buffer} data
	 */
	const sourceWriter = data => {
		if (verbose) {
			console.log(`Receiving file UDP: ${data}`);
		}

		if (opts.noCbor) {
			receiver.write(data);
		} else {
			const toDecode = parseInt(data[0], 10) === 0 ? data.subarray(1) : data;
			const decoded = cbor.decode(toDecode);

			receiver.write(decoded);
		}
	};
	const recWriter = data => {
		if (verbose) {
			console.log(`Sending file UDP: ${data}`);
		}

		if (opts.noCbor) {
			source.write(data);
		} else {
			const encoded = Buffer.concat([Buffer.alloc(1, 0), cbor.encode(data)]);

			source.write(encoded);
		}
	};

	receiver.on('data', recWriter);

	source.on('data', sourceWriter);

	receiver.on('error', err => {
		receiver.removeAllListeners();
		receiver.destroy();
		source.off('data', sourceWriter);
		reject(err);
	});

	receiver.on('close', () => {
		receiver.destroy();
		source.off('data', sourceWriter);
		resolve(storagePath);
	});
});

module.exports = fileDownlinker;
