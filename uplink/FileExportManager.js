const fs = require('fs');
const path = require('path');
const { Duplex } = require('stream');

class FileExportManager extends Duplex {
	constructor({ num_chunks, storage_path, destination_path, channel_id, mode }) {
		super({ readableObjectMode: true, writableObjectMode: true });

		this.channel_id = channel_id;
		this.mode = mode;

		if (!(this.channel_id && this.mode)) {
			this.destroy(new Error(`File Export requires both channel_id and mode`));
		}

		this.path = destination_path || '';

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
		 * @type {Set<number>}
		 */
		this.retrying = new Set();
		/**
		 * @type {NodeJS.Timeout}
		 */
		this.no_resp_timeout = setTimeout(() => {
			this.emit('error', new Error('File uplink timed out'));
			this.cleanupAndExit();
		}, 2500);

		[this.createMetaMessage(), this.createExportMessage()].forEach(msg => this.send(msg));
	}

	send(obj) {
		this.push(obj);
	}

	cleanupAndExit() {
		clearTimeout(this.no_resp_timeout);
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

		this.no_resp_timeout = setTimeout(() => {
			this.cleanupAndExit();
		}, 2500);
	}

	_write(chunk, _, next) {
		const [rec_id, rec_hash, rec_ak, ...failed_chunks] = chunk;

		clearTimeout(this.no_resp_timeout);

		if (rec_id !== this.channel_id) {
			console.error(new Error(`File Export on channel ${this.channel_id} received a misdirected message intended for channel ${rec_id}`));
			this.emit(
				'error',
				new Error(`File Export on channel ${this.channel_id} received a misdirected message intended for channel ${rec_id}`)
			);

			return next();
		}

		if (rec_hash === true && this.received_ack) {
			return this.cleanupAndExit();
		}

		if (rec_hash !== this.hash) {
			console.error(new Error(`File Export on channel ${this.channel_id} received an incorrect hash (was ${rec_hash} expected ${this.hash})`))
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
