const fs = require('fs');
const { Writable, Readable, Duplex } = require('stream');
const FileExportManager = require('./FileExportManager.js');
const TempFileStore = require('./TempFileStore.js');

/**
 * @param {Readable|string} f_stream
 * @param {Writable|Duplex} dup_stream
 * @returns {Promise<void>}
 */
const fileUplinker = (f_stream, dup_stream) => new Promise((resolve, reject) => {
	const [isReadable, isWritable] = [dup_stream instanceof Readable, dup_stream instanceof Writable];
	let fileSource;

	if (!isWritable) {
		return reject(new Error('Second argument to fileUplinker must be a Writable or Duplex Stream'));
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
		const fExportMgr = new FileExportManager(data);

		fExportMgr.pipe(dup_stream);

		if (isReadable) {
			dup_stream.pipe(fExportMgr);
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
