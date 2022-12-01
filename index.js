const uplink = require('./uplink/fileUplinker');
const downlink = require('./downlink/fileDownlinker');
const createChannelId = require('./utils/createChannelId');

module.exports = { downlink, uplink, createChannelId };
