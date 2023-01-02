const fs = require('fs');
const { Writable, Readable, Duplex } = require('stream');
const cbor = require('cbor');
const FileExportManager = require('./FileExportManager.js');
const TempFileStore = require('./TempFileStore.js');

/**
 * @param {Readable|string} f_stream
 * @param {Writable|Duplex} dup_stream
 * @param {object} opts
 * @param {string|number} opts.mode
 * @param {number} opts.channel_id
 * @param {number} opts.chunkSize
 * @param {number} opts.hashChunkSize
 * @param {string} opts.remotePath
 * @param {boolean} opts.verbose
 * @returns {Promise<void>}
 */
const fileUplinker = (f_stream, dup_stream, opts) => new Promise((resolve, reject) => {
	const { mode, channel_id, chunkSize, hashChunkSize, remotePath, verbose } = opts || {};
	const [isReadable, isWritable] = [dup_stream instanceof Readable, dup_stream instanceof Writable];
	let fileSource;

	if (!isWritable) {
		return reject(new Error('Second argument to fileUplinker must be a Writable or Duplex Stream'));
	}

	if (!(channel_id && mode)) {
		return reject(new Error('The third options argument must contain both channel_id and mode properties'));
	}

	if (f_stream instanceof Readable) {
		fileSource = f_stream;
	} else {
		try {
			fileSource = fs.createReadStream(f_stream);
		} catch (err) {
			return reject(err);
		}
	}

	const tempStore = fileSource.pipe(new TempFileStore({ chunkSize, hashChunkSize }));

	tempStore.on(TempFileStore.STORAGE_FINISHED, data => {
		const fExportMgr = new FileExportManager({ ...data, channel_id, mode, destination_path: remotePath });

		if (opts.noCbor) {
			fExportMgr.pipe(dup_stream);
		} else {
			fExportMgr.on('data', uplinkData => {
				const encoded = Buffer.concat([Buffer.alloc(1, 0), cbor.encode(uplinkData)]);

				if (verbose) {
					console.log(`Sending file UDP: ${uplinkData}`);
				}

				dup_stream.write(encoded);
			});
		}

		if (isReadable) {
			if (opts.noCbor) {
				dup_stream.pipe(fExportMgr);
			} else {
				dup_stream.on('data', encoded => {
					const decoded = parseInt(encoded[0]) === 0
						? cbor.decode(encoded.subarray(1))
						: cbor.decode(encoded);

					if (verbose) {
						console.log(`Receiving file UDP: ${decoded}`);
					}

					fExportMgr.write(decoded);
				});
			}
		}

		fExportMgr.on('error', err => {
			// Remove listeners to prevent the Promise from resolving
			fExportMgr.removeAllListeners();
			reject(err);
		});

		fExportMgr.on('close', () => {
			resolve();
		});
	});
});

module.exports = fileUplinker;
