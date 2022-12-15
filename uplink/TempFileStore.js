const { randomUUID } = require('crypto');
const fs = require('fs');
const { copyFile } = require('fs/promises');
const path = require('path');
const process = require('process');
const { Writable } = require('stream');
const blake2 = require('blake2');

const CHUNK_SIZE = 1024;
const HASH_CHUNK_SIZE = 2048;
const CHUNK_FINISHED = 'CHUNK_FINISHED';
const INTERNAL_FINISHED = 'INTERNAL_FINISHED';

class TempFileStore extends Writable {
	static STORAGE_FINISHED = 'STORAGE_FINISHED';

	constructor({ ca_path, chunkSize = CHUNK_SIZE, hashChunkSize = HASH_CHUNK_SIZE } = {}) {
		super();

		/**
		 * @type {number[]}
		 */
		this.holdingArr = [];
		/**
		 * @type {number[]}
		 */
		this.hashingArr = [];
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

		this.chunkSize = chunkSize || CHUNK_SIZE;
		this.hashChunkSize = hashChunkSize || HASH_CHUNK_SIZE;

		fs.mkdirSync(path.join(process.cwd(), this.ca_path, this.temp_parent_folder));

		this.on(CHUNK_FINISHED, this.checkCompleteness);
	}

	/**
	 * @param {boolean} meta
	 */
	createPath(meta) {
		const nextPath = path.join(
			process.cwd(),
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
		const hashBytes = this.hashingArr.concat(chunks);

		while (allBytes.length >= this.chunkSize) {
			const nextChunkStrm = fs.createWriteStream(this.createPath());

			nextChunkStrm.end(Buffer.from(allBytes.splice(0, this.chunkSize)), err => {
				this.tempFilesWritten += 1;
				this.emit(CHUNK_FINISHED, err);
			});
		}

		while (hashBytes.length >= this.hashChunkSize) {
			this.file_hash.update(Buffer.from(hashBytes.splice(0, this.hashChunkSize)));
		}

		this.holdingArr = allBytes;
		this.hashingArr = hashBytes;

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
				const temporaryPath = path.join(process.cwd(), this.ca_path, this.temp_parent_folder);
				const storage_path = path.join(process.cwd(), this.ca_path, this.file_hash.digest().toString('hex'));

				fs.mkdirSync(storage_path);

				Promise.all(fs.readdirSync(temporaryPath).map(fileName => {
					copyFile(path.join(temporaryPath, fileName), path.join(storage_path, fileName))
				}))
					.then(() => {
						fs.unlinkSync(temporaryPath);

						this.emit(
							TempFileStore.STORAGE_FINISHED,
							{
								num_chunks: this.fileChunkCount,
								storage_path,
							}
						);
						next();
					});
			});

			this.checkCompleteness();
		});
	}
}

module.exports = TempFileStore;
