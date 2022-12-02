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

	const sourceWriter = data => receiver.write(data);
	const recWriter = data => source.write(data);

	receiver.on('data',recWriter);

	source.on('data', sourceWriter);

	receiver.on('error', err => {
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
