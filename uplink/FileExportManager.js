const fs = require('fs');
const path = require('path');
const { Duplex } = require('stream');

const INITIAL_SEND_COMPLETE = 'INITIAL_SEND_COMPLETE';

class FileExportManager extends Duplex {
	constructor({ num_chunks, storage_path }) {
		console.time('Initial send completed');
		super({ readableObjectMode: true });

		this.channel_id = 'Placeholder_Channel_ID';
		this.path = 'Placeholder_Path';
		this.mode = 'Placeholder_Mode';

		/**
		 * @type {string}
		 */
		this.hash = path.parse(storage_path).base;
		/**
		 * @type {string}
		 */
		this.storage_path = storage_path;
		/**
		 * @type {number}
		 */
		this.num_chunks = num_chunks;
		/**
		 * @type {boolean}
		 */
		this.initial_send_complete = false;
		/**
		 * @type {number}
		 */
		this.initial_send_count = 0;
		/**
		 * @type {Set<number>}
		 */
		this.retrying = new Set();

		[this.createMetaMessage(), this.createExportMessage()].forEach(msg => this.send(msg));

		this.on(INITIAL_SEND_COMPLETE, () => {
			this.initial_send_complete = true;
			console.log('');
			console.timeEnd('Initial send completed');
			console.log(this.hash);
			setTimeout(() => {
				this.cleanupAndExit();
			}, 2500);
		});

		this.sendInitial();
	}

	send(obj) {
		this.push(obj);
	}

	cleanupAndExit() {
		fs.rm(this.storage_path, { recursive: true, force: true }, () => {
			this.destroy();
		});
	}

	createMetaMessage() {
		return [this.channel_id, this.hash, this.num_chunks];
	}

	createExportMessage() {
		return [this.channel_id, 'export', this.hash, this.path, this.mode];
	}

	sendInitial() {
		[...Array(this.num_chunks)].forEach((_, chunkNumber) => {
			const chunkStrm = fs.createReadStream(path.join(this.storage_path, `${chunkNumber}`));
			let chunkBuf = Buffer.alloc(0);

			chunkStrm.on('data', buf => {
				chunkBuf = Buffer.concat([chunkBuf, buf]);
			});

			chunkStrm.on('end', () => {
				this.send([this.channel_id, this.hash, chunkNumber, chunkBuf]);
				this.initial_send_count += 1;

				if (this.initial_send_count === this.num_chunks) {
					this.emit(INITIAL_SEND_COMPLETE);
				}
			});
		});
	}

	/**
	 * @param {number[]} missingChunks
	 */
	sendRetries(missingChunks) {
		missingChunks.forEach(chunkNumber => {
			const chunkStrm = fs.createReadStream(path.join(this.storage_path, `${chunkNumber}`));
			let chunkBuf = Buffer.alloc(0);

			this.retrying.add(chunkNumber);

			chunkStrm.on('data', buf => {
				chunkBuf = Buffer.concat([chunkBuf, buf]);
			});

			chunkStrm.on('end', () => {
				this.retrying.delete(chunkNumber);
				this.send([this.channel_id, this.hash, chunkNumber, chunkBuf]);
			});
		});
	}

	_write(chunk, _, next) {
		const [rec_id, rec_hash, rec_ak, ...failed_chunks] = JSON.parse(chunk.toString());

		if (rec_id !== this.channel_id) {
			this.emit(
				'error',
				new Error(`File Export on channel ${this.channel_id} received a misdirected message intended for channel ${rec_id}`)
			);

			return next();
		}

		if (rec_hash === true && this.received_ack) {
			this.cleanupAndExit();
		}

		if (rec_hash !== this.hash) {
			this.emit(
				'error',
				new Error(`File Export on channel ${this.channel_id} received an incorrect hash (was ${rec_hash} expected ${this.hash})`)
			);

			return next();
		}

		if (rec_ak) {
			this.received_ack = true;
			setTimeout(() => {
				this.cleanupAndExit();
			}, 2500);
		} else {
			if (!this.initial_send_complete) {
				return next();
			}

			if (failed_chunks.length % 2 !== 0) {
				this.emit(
					'error',
					new Error(`File Export could not understand the list of ranges of missing file chunks; was ${failed_chunks}`)
				);
			}

			const missingChunks = [];

			while (failed_chunks.length) {
				const [start, excl] = failed_chunks.splice(0, 2);
				let i = start;

				while (i < excl) {
					missingChunks.push(i);
					i += 1;
				}
			}

			this.sendRetries(missingChunks.filter(num => !this.retrying.has(num)));
		}

		next();
	}

	_read() { }
}

module.exports = FileExportManager;
