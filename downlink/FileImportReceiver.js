const fs = require('fs');
const { Duplex, PassThrough } = require('stream');

const MAX_NAK_COUNT = 4;

class FileImportReceiver extends Duplex {
	static UNEXPECTED_MESSAGE = 'UNEXPECTED_IMPORT_MESSAGE';

	constructor({ destination }) {
		super({ readableObjectMode: true });

		/**
		 * @type {fs.WriteStream}
		 */
		this.dest = fs.createWriteStream(destination);
		/**
		 * @type {NodeJS.Timer}
		 */
		this.inactive_timeout = setTimeout(() => {
			this.timeOutImport();
		}, 10000);
		/**
		 * @type {NodeJS.Timer}
		 */
		this.wait_timeout = null;
		/**
		 * @type {Map<number, Buffer>}
		 */
		this.out_of_seq_chunks = new Map();

		this.file_writer = new PassThrough();

		this.channel_id = 'PID';
		this.next_expected_chunk = 0;
		this.nak = null;
		this.nak_count = 0;

		this.dest.on('finish', () => {
			this.destroy();
		});
		this.file_writer.pipe(this.dest);
	}

	send(obj) {
		this.push(obj);
	}

	updateNakMsg(missingPairs) {
		this.nak = [this.channel_id, this.hash, false, ...missingPairs];
	}

	timeOutImport() {
		this.dest.destroy();
		this.destroy(new Error(`File Import timed out after > 10 seconds with no message`));
	}

	sendNak() {
		if (this.nak_count >= MAX_NAK_COUNT) {
			return this.timeOutImport();
		}

		this.nak_count += 1;
		this.send(this.nak);
	}

	initializeWaitTimeout() {
		clearTimeout(this.wait_timeout);

		this.wait_timeout = setInterval(() => {
			this.sendNak();
		}, 2500);
	}

	/**
	 * @param {string} rec_id
	 * @param {boolean} success
	 * @param {string} hash
	 * @param {number} num_chunks
	 * @param {string} mode
	 */
	handleReadyMessage(rec_id, success, hash, num_chunks, mode) {
		if (rec_id !== this.channel_id) {
			this.emit(
				FileImportReceiver.UNEXPECTED_MESSAGE,
				new Error(`File Import on channel ${this.channel_id} received a misdirected message intended for channel ${rec_id}`)
			);

			return;
		}

		if (!success) {
			this.emit(FileImportReceiver.UNEXPECTED_MESSAGE, new Error(`File Import expected success to be true but got ${success}`));

			return;
		}

		this.hash = hash;
		this.expected_chunk_count = num_chunks;
		this.mode = mode;
		this.isReady = true;

		this.checkFileComplete();
	}

	checkFileComplete() {
		if (this.next_expected_chunk === this.expected_chunk_count) {
			this.file_writer.end();
			return;
		}

		let pairsList = [];
		let nextPair = [this.next_expected_chunk];
		let inMissing = true;

		for (let i = this.next_expected_chunk + 1; i <= this.expected_chunk_count; i += 1) {
			if (inMissing) {
				if (this.out_of_seq_chunks.has(i)) {
					nextPair.push(i);
					pairsList = [...pairsList, ...nextPair];
					nextPair = [];
					inMissing = false;
				}
			} else {
				if (!this.out_of_seq_chunks.has(i)) {
					nextPair.push(i);
					inMissing = true;
				}
			}
		}

		if (nextPair.length === 1 && nextPair[0] !== this.expected_chunk_count) {
			nextPair.push(this.expected_chunk_count);
			pairsList = [...pairsList, ...nextPair];
		}

		this.updateNakMsg(pairsList);

		if (!this.wait_timeout) {
			this.sendNak();
			this.initializeWaitTimeout();
		}
	}

	/**
	 * @param {number} index
	 * @param {Buffer} data
	 */
	writeOrStoreChunk(index, data) {
		if (!this.isReady) {
			this.emit(FileImportReceiver.UNEXPECTED_MESSAGE, new Error(`File Import received a file chunk message before an initial SUCCESS message!`));

			return;
		}

		if (index === this.next_expected_chunk) {
			this.file_writer.write(data);
			this.next_expected_chunk += 1;

			while (this.out_of_seq_chunks.has(this.next_expected_chunk)) {
				this.file_writer.write(this.out_of_seq_chunks.get(this.next_expected_chunk));
				this.out_of_seq_chunks.delete(this.next_expected_chunk);
				this.next_expected_chunk += 1;
			}
		} else {
			this.out_of_seq_chunks.set(index, data);
		}

		this.checkFileComplete();
	}

	_write(chunk, _, next) {
		console.log(`got ${chunk}`);
		try {
			const result = JSON.parse(chunk.toString());
			const [rec_id, rec_hash, rec_ak, ...failed_chunks] = result;

			if (rec_id !== this.channel_id) {
				this.emit(
					FileImportReceiver.UNEXPECTED_MESSAGE,
					new Error(`File Export on channel ${this.channel_id} received a misdirected message intended for channel ${rec_id}`)
				);

				return next();
			}

			if (rec_hash === true) {
				console.log('handling ready message');
				this.handleReadyMessage(...result);

				return next();
			}

			if (Number.isInteger(rec_ak)) {
				this.writeOrStoreChunk(rec_ak, failed_chunks[0]);

				return next();
			}

			throw new Error(`Unrecognized message: ${chunk.toString()}`);
		} catch (err) {
			this.emit(FileImportReceiver.UNEXPECTED_MESSAGE, err);

			next();
		}
	}

	_read() { }
}

module.exports = FileImportReceiver;
