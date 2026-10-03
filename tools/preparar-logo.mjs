/**
 * Recorta el logo y le quita el fondo blanco, sin dependencias externas.
 *
 * El PNG original viene en 1254x1254 con mucho margen blanco alrededor, así
 * que en un encabezado se vería diminuto. Además el fondo transparente permite
 * usarlo sobre papel claro o sobre azul marino sin caja blanca.
 *
 *   node tools/preparar-logo.mjs <entrada.png> <salida.png> [margen]
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const entrada = process.argv[2];
const salida = process.argv[3];
const margen = Number(process.argv[4] ?? 12);
const enReverso = process.argv.includes('--reverso');
if (!entrada || !salida) {
  console.error('uso: node tools/preparar-logo.mjs <entrada.png> <salida.png> [margen]');
  process.exit(1);
}

/* ----------------------------------------------------------------- lectura */

const buffer = fs.readFileSync(entrada);
let offset = 8;
let width = 0;
let height = 0;
let bitDepth = 8;
let colorType = 6;
const idat = [];
while (offset < buffer.length) {
  const length = buffer.readUInt32BE(offset);
  const type = buffer.toString('ascii', offset + 4, offset + 8);
  const data = buffer.subarray(offset + 8, offset + 8 + length);
  if (type === 'IHDR') {
    width = data.readUInt32BE(0);
    height = data.readUInt32BE(4);
    bitDepth = data[8];
    colorType = data[9];
  } else if (type === 'IDAT') idat.push(data);
  else if (type === 'IEND') break;
  offset += 12 + length;
}
if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) {
  console.error(`Formato no soportado (profundidad ${bitDepth}, tipo ${colorType}).`);
  process.exit(1);
}

const channels = colorType === 6 ? 4 : 3;
const raw = zlib.inflateSync(Buffer.concat(idat));
const stride = width * channels;
const pixels = Buffer.alloc(height * stride);

const paeth = (a, b, c) => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

let pos = 0;
for (let y = 0; y < height; y += 1) {
  const filter = raw[pos];
  pos += 1;
  const row = pixels.subarray(y * stride, (y + 1) * stride);
  const prev = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;
  for (let x = 0; x < stride; x += 1) {
    const value = raw[pos + x];
    const left = x >= channels ? row[x - channels] : 0;
    const up = prev ? prev[x] : 0;
    const upLeft = prev && x >= channels ? prev[x - channels] : 0;
    if (filter === 0) row[x] = value;
    else if (filter === 1) row[x] = (value + left) & 0xff;
    else if (filter === 2) row[x] = (value + up) & 0xff;
    else if (filter === 3) row[x] = (value + Math.floor((left + up) / 2)) & 0xff;
    else row[x] = (value + paeth(left, up, upLeft)) & 0xff;
  }
  pos += stride;
}

/* -------------------------------------------------- recorte y transparencia */

const BLANCO = 244;
const esFondo = (r, g, b) => r >= BLANCO && g >= BLANCO && b >= BLANCO;

let minX = width;
let minY = height;
let maxX = -1;
let maxY = -1;
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const i = y * stride + x * channels;
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    if (esFondo(r, g, b)) continue;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
}
if (maxX < 0) {
  console.error('No se encontró ninguna marca en la imagen.');
  process.exit(1);
}

const x0 = Math.max(0, minX - margen);
const y0 = Math.max(0, minY - margen);
const outW = Math.min(width - x0, maxX - minX + 1 + margen * 2);
const outH = Math.min(height - y0, maxY - minY + 1 + margen * 2);

const rgba = Buffer.alloc(outW * outH * 4);
for (let y = 0; y < outH; y += 1) {
  for (let x = 0; x < outW; x += 1) {
    const src = (y + y0) * stride + (x + x0) * channels;
    const dst = (y * outW + x) * 4;
    const r = pixels[src];
    const g = pixels[src + 1];
    const b = pixels[src + 2];
    // Los bordes del logo tienen un halo gris muy claro: se vuelven
    // transparente con una mezcla suave para que no se vea un recuadro.
    const luminancia = Math.max(r, g, b);
    const alpha = luminancia >= BLANCO ? 0 : Math.min(255, Math.round(((BLANCO - luminancia) / (BLANCO - 200)) * 255));
    // El azul de marca (b muy por encima de r) se conserva; el resto, que es
    // el marino de la marca, pasa a blanco para-legged sobre fondos oscuros.
    const esAzul = b - r > 60;
    rgba[dst] = enReverso && !esAzul && alpha > 0 ? 255 : r;
    rgba[dst + 1] = enReverso && !esAzul && alpha > 0 ? 255 : g;
    rgba[dst + 2] = enReverso && !esAzul && alpha > 0 ? 255 : b;
    rgba[dst + 3] = alpha < 255 && alpha > 0 ? 255 : alpha;
  }
}

/* ---------------------------------------------------------------- escritura */

const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(outW, 0);
ihdr.writeUInt32BE(outH, 4);
ihdr[8] = 8;
ihdr[9] = 6;
const scanlines = Buffer.alloc(outH * (outW * 4 + 1));
for (let y = 0; y < outH; y += 1) {
  scanlines[y * (outW * 4 + 1)] = 0;
  rgba.copy(scanlines, y * (outW * 4 + 1) + 1, y * outW * 4, (y + 1) * outW * 4);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(scanlines, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
]);

fs.mkdirSync(path.dirname(salida), { recursive: true });
fs.writeFileSync(salida, png);
console.log(`recortado: ${width}x${height} -> ${outW}x${outH} | fondo transparente${enReverso ? ' | version en blanco para fondos oscuros' : ''} | ${Math.round(png.length / 1024)} KB`);