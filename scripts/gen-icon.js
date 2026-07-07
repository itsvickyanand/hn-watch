// gen-icon.js — generate a simple tray icon PNG with no dependencies.
//
// Draws a filled rounded square (black + alpha) at 22x22, which macOS treats
// as a "template" image and recolors to match the menu bar. Run once:
//   node scripts/gen-icon.js
// Output: assets/trayTemplate.png

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 22;

// Build an RGBA pixel buffer: a rounded black square silhouette.
function buildPixels() {
  const rows = [];
  const r = 5; // corner radius
  for (let y = 0; y < SIZE; y++) {
    const row = [0]; // PNG filter byte (0 = none) at the start of each row
    for (let x = 0; x < SIZE; x++) {
      // distance from nearest corner for rounding
      const inX = x < r ? r - x : x >= SIZE - r ? x - (SIZE - r - 1) : 0;
      const inY = y < r ? r - y : y >= SIZE - r ? y - (SIZE - r - 1) : 0;
      const rounded = inX > 0 && inY > 0 && inX * inX + inY * inY > r * r;
      const on = !rounded;
      row.push(0, 0, 0, on ? 255 : 0); // R,G,B,A  (black, opaque where "on")
    }
    rows.push(Buffer.from(row));
  }
  return Buffer.concat(rows);
}

// Minimal PNG encoder (IHDR + IDAT + IEND).
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type 6 = RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // signature
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(buildPixels())),
  chunk('IEND', Buffer.alloc(0)),
]);

const outDir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'trayTemplate.png'), png);
console.log('wrote assets/trayTemplate.png');
