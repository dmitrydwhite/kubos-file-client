const { randomInt } = require('crypto');

const CHNL_ID_MIN = 100000;
const CHNL_ID_MAX = Math.pow(2, 32) + 1;

const createChannelId = () => {
	return randomInt(CHNL_ID_MIN, CHNL_ID_MAX);
};

module.exports = createChannelId;
