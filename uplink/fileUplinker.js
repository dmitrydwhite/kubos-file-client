const fs = require('fs');
const { Writable, Readable, Duplex } = require('stream');
const cbor = require('cbor');
const FileExportManager = require('./FileExportManager.js');
const TempFileStore = require('./TempFileStore.js');

/**
 * @param {Readable|string} f_stream
 * @param {Writable|Duplex} dup_stream
 * @returns {Promise<void>}
 */
const fileUplinker = (f_stream, dup_stream, opts = {}) => new Promise((resolve, reject) => {
	const { mode, channel_id } = opts;
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

	const tempStore = fileSource.pipe(new TempFileStore());

	tempStore.on(TempFileStore.STORAGE_FINISHED, data => {
		const fExportMgr = new FileExportManager({ ...data, channel_id, mode });

		if (opts.noCbor) {
			fExportMgr.pipe(dup_stream);
		} else {
			fExportMgr.pipe(new cbor.Encoder()).pipe(dup_stream);
		}

		if (isReadable) {
			if (opts.noCbor) {
				dup_stream.pipe(fExportMgr);
			} else {
				dup_stream.pipe(new cbor.Decoder()).pipe(fExportMgr);
			}
		}

		fExportMgr.on('error', err => {
			reject(err);
		});

		fExportMgr.on('close', () => {
			resolve();
		});
	});
});

module.exports = fileUplinker;
