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