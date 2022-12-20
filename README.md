# `kubos-file-client`

This is a Node.js utility intended to work with the [KubOS file transfer protocol](https://docs.kubos.com/master/1.21.0+4/deep-dive/protocols/file-protocol.html#apis).

## How to use it

### Uplinking a file

```js
const { uplink } = require('kubos-file-client');
// Get a Node.js stream as an uplink destination:
const MyUplink = new SatUplinkSocket();
const myFilePath = '/usr/some/file/path.txt';

uplink(myFilePath, MyUplink)
	.then(() => {
		console.log(`finished uplinking ${myFilePath}`);
	})
	.catch(err => {
		console.log(`there was an error uplinking ${myFilePath}`);
		console.error(err);
	});
```

### Downlinking a file

```js
const { downlink } = require('kubos-file-client');
const MyDownlink = new SatDownlinkSocket();
const destinationPath = '/usr/home/local/destination/filepath.txt';
const targetLocation = '/remote/location/filepath.txt';
const uniqueId = getUniqueId();

downlink(uniqueId, destinationPath, targetLocation, MyDownlink)
	.then(filePath => {
		console.log(`file has been downlinked to ${filePath}`);
	})
	.catch(err => {
		console.log(`there was an error uplinking ${filePath}`);
		console.error(err);
	});
//
```