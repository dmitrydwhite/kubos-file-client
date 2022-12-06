const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const { Writable } = require('stream');
const blake2 = require('blake2');

const FOUR_KB = 4000;
const CHUNK_FINISHED = 'CHUNK_FINISHED';
const INTERNAL_FINISHED = 'INTERNAL_FINISHED';

class TempFileStore extends Writable {
	static STORAGE_FINISHED = 'STORAGE_FINISHED';

	constructor({ ca_path } = {}) {
		super();

		/**
		 * @type {number[]}
		 */
		this.holdingArr = [];
		/**
		 * @type {number}
		 */
		this.fileChunkCount = 0;
		/**
		 * @type {number}
		 */
		this.tempFilesWritten = 0;
		/**
		 * @type {string}
		 */
		this.ca_path = ca_path || '';
		/**
		 * @type {string}
		 */
		this.temp_parent_folder = randomUUID();
		/**
		 * @type {blake2.Hash}
		 */
		this.file_hash = blake2.createHash('blake2s', { digestLength: 16 });

		fs.mkdirSync(path.join(__dirname, this.ca_path, this.temp_parent_folder));

		this.on(CHUNK_FINISHED, this.checkCompleteness);
	}

	/**
	 * @param {(err?: Error) => void} cb
	 */
	writeMetaFileAndFinish(cb) {
	}

	/**
	 * @param {boolean} meta
	 */
	createPath(meta) {
		const nextPath = path.join(
			__dirname,
			this.ca_path,
			this.temp_parent_folder, meta ? 'meta' : `${this.fileChunkCount}`
		);

		this.fileChunkCount += meta ? 0 : 1;

		return nextPath;
	}

	createMetaPath() {
		return this.createPath(true);
	}

	/**
	 * @param {Error?} err
	 */
	checkCompleteness(err) {
		if (err) {
			return this.destroy(err);
		}

		if (this.metaWritten && this.fileChunkCount === this.tempFilesWritten) {
			this.emit(INTERNAL_FINISHED);
		}
	}

	/**
	 * @param {Buffer} chunk
	 * @param {*} _
	 * @param {(err?: Error) => void} next
	 */
	_write(chunk, _, next) {
		const chunks = Array.from(chunk);
		const allBytes = this.holdingArr.concat(chunks);

		this.file_hash.update(chunk);

		while (allBytes.length >= FOUR_KB) {
			const nextChunkStrm = fs.createWriteStream(this.createPath());

			nextChunkStrm.end(Buffer.from(allBytes.splice(0, FOUR_KB)), err => {
				this.tempFilesWritten += 1;
				this.emit(CHUNK_FINISHED, err);
			});
		}

		this.holdingArr = allBytes;

		next();
	}

	/**
	 * @param {(err?: Error) => void} next
	 */
	_final(next) {
		if (this.holdingArr.length) {
			const nextChunkStrm = fs.createWriteStream(this.createPath());

			nextChunkStrm.end(Buffer.from(this.holdingArr), err => {
				this.tempFilesWritten += 1;
				this.emit(CHUNK_FINISHED, err);
			});
		}

		const metaFileStrm = fs.createWriteStream(this.createMetaPath());

		metaFileStrm.end(`{ "num_chunks": ${this.fileChunkCount} }`, err => {
			if (err) {
				return next(err);
			}

			this.metaWritten = true;
			this.on(INTERNAL_FINISHED, () => {
				const temporaryPath = path.join(__dirname, this.ca_path, this.temp_parent_folder);
				const storage_path = path.join(__dirname, this.ca_path, this.file_hash.digest().toString('hex'));

				fs.renameSync(temporaryPath, storage_path);

				this.emit(
					TempFileStore.STORAGE_FINISHED,
					{
						num_chunks: this.fileChunkCount,
						storage_path,
					}
				);
				next();
			});
			this.checkCompleteness();
		});
	}
}

module.exports = TempFileStore;
