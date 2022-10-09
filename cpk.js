const fs = require('fs');
const path = require('path');
const util = require('util');
const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);
const mkdir = util.promisify(fs.mkdir);

function findZero(buffer, start) {
  while (buffer[start] !== 0x0) start++;
  return start;
}

function parseUtf(buffer, toString) {
  if (!buffer || buffer.length < 4) return null;
  let pos = 0;
  const config = {};
  config.magic = buffer.slice(pos, 4).toString(); pos += 4;
  if (config.magic !== '@UTF') return null;
  config.dataSize = buffer.readUInt32BE(pos); pos += 4;
  buffer = buffer.slice(pos);
  pos = 0;
  config.unknown = buffer.readUInt16BE(pos); pos += 2;
  config.valueOffset = buffer.readUInt16BE(pos); pos += 2;
  config.stringOffset = buffer.readUInt32BE(pos); pos += 4;
  config.dataOffset = buffer.readUInt32BE(pos); pos += 4;
  config.nameOffset = buffer.readUInt32BE(pos); pos += 4;
  config.elementCount = buffer.readUInt16BE(pos); pos += 2;
  config.valueSize = buffer.readUInt16BE(pos); pos += 2;
  config.pageCount = buffer.readUInt32BE(pos); pos += 4;
  let stringEnd = findZero(buffer, config.stringOffset);
  config.name = buffer.slice(config.stringOffset, stringEnd).toString();
  let valuePos = config.valueOffset;
  const pages = [];
  config.types = [];
  let firstPos = pos;
  for (let i = 0; i < config.pageCount; i++) {
    let page = {};
    pos = firstPos;
    for (let j = 0; j < config.elementCount; j++) {
      let type = buffer.readUInt8(pos); pos = pos + 1;
      if (i === 0) config.types[j] = type;
      let stringOffset = config.stringOffset + buffer.readUInt32BE(pos); pos += 4;
      stringEnd = findZero(buffer, stringOffset);
      const key = buffer.slice(stringOffset, stringEnd).toString();
      const method = type >>> 5;
      type = type & 0x1F;
      let value = null;
      if (method > 0) {
        let offset = method === 1 ? pos : valuePos;
        switch (type) {
          case 0x10: value = buffer.readInt8(offset); offset += 1; break;
          case 0x11: value = buffer.readUInt8(offset); offset += 1; break;
          case 0x12: value = buffer.readInt16BE(offset); offset += 2; break;
          case 0x13: value = buffer.readUInt16BE(offset); offset += 2; break;
          case 0x14: value = buffer.readInt32BE(offset); offset += 4; break;
          case 0x15: value = buffer.readUInt32BE(offset); offset += 4; break;
          case 0x16: value = buffer.readBigInt64BE(offset); offset += 8; break;
          case 0x17: value = buffer.readBigUInt64BE(offset); offset += 8; break;
          case 0x18: value = buffer.readFloatBE(offset); offset += 4; break;
          case 0x19: debugger; value = buffer.readDoubleBE(offset); offset += 8; break;
          case 0x1A:
            stringOffset = config.stringOffset + buffer.readUInt32BE(offset); offset += 4;
            stringEnd = findZero(buffer, stringOffset);
            value = buffer.slice(stringOffset, stringEnd).toString();
            break;
          case 0x1B:
            const bufferStart = config.dataOffset + buffer.readUInt32BE(offset); offset += 4;
            const bufferLen = buffer.readUInt32BE(offset); offset += 4;
            value = buffer.slice(bufferStart, bufferStart + bufferLen);
            let temp = parseUtf(value, toString);
            if (temp) value = temp; else if (toString) value = buffer.slice(bufferStart, bufferStart + bufferLen).toString('hex');
            break;
          default:
            console.log(`unknown type: ${type}`);
            break;
        }
        if (method === 1) pos = offset; else valuePos = offset;
      }
      page[key] = value;
    }
    pages.push(page);
  }
  pages.config = config;
  return pages;
}
exports.parseUtf = parseUtf;

async function viewUtf(acbPath, outputPath) {
  const pathInfo = path.parse(acbPath);
  if (outputPath === undefined) outputPath = path.join(pathInfo.dir, pathInfo.name + '.json');
  console.log(`Parsing ${pathInfo.base}...`);
  const buffer = await readFile(acbPath);
  const obj = parseUtf(buffer, true);
  if (obj && obj.AwbFile && obj.AwbFile.length > 0x20) obj.AwbFile = obj.AwbFile.substring(0, 0x20);
  console.log(`Writing ${path.parse(outputPath).base}...`);
  await writeFile(outputPath, JSON.stringify(obj, null, 2));
}
exports.viewUtf = viewUtf;

function parseTag(buffer, tag) {
  if (tag !== buffer.slice(0, 4).toString()) return null;
  const size = buffer.readUInt32LE(0x8);
  if (!size) return null;
  const offset = 0x10;
  return parseUtf(buffer.slice(offset, offset + size));
}

async function parseCpk(cpkPath) {
  const buffer = await readFile(cpkPath);
  let utfs = parseTag(buffer, 'CPK ');
  if (!utfs || utfs.length !== 1) return null;
  const cpk = { buffer };
  cpk.info = utfs[0];
  let offset, size;
  // HTOC
  offset = (Number)(cpk.info.HtocOffset);
  size = (Number)(cpk.info.HtocSize);
  if (offset && size) cpk.htoc = parseTag(buffer.slice(offset, offset + size), 'HTOC');
  // TOC
  offset = (Number)(cpk.info.TocOffset);
  size = (Number)(cpk.info.TocSize);
  if (offset && size) cpk.toc = parseTag(buffer.slice(offset, offset + size), 'TOC ');
  // ETOC
  offset = (Number)(cpk.info.EtocOffset);
  size = (Number)(cpk.info.EtocSize);
  if (offset && size) cpk.etoc = parseTag(buffer.slice(offset, offset + size), 'ETOC');
  return cpk;
}

async function extractCpk(cpkPath, output,index,maxIndex) {
  const cpk = await parseCpk(cpkPath);
  if (!cpk) return;
  if (output === undefined) output = path.parse(cpkPath).dir;
  let filename = path.parse(cpkPath.replace(/^.*[\\\/]/, '')).name
  for (let i = 0; i < cpk.toc.length; i++) {
    const item = cpk.toc[i];
    let buffer = cpk.buffer;
    const offset = (Number)(cpk.info.TocOffset + item.FileOffset);
    let fileBuffer = buffer.slice(offset, offset + item.FileSize);
    fileBuffer = extract(fileBuffer);
    const dir = path.join(output, `${filename}/`,item.DirName);
    if (!fs.existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    await writeFile(path.join(dir, item.FileName), fileBuffer);
    
  }
  fs.unlinkSync(cpkPath)
  console.log(`Extracting ${cpkPath.replace(`${process.cwd()}\\`,'')} | ${index}/${maxIndex}`)
}
exports.extractCpk = extractCpk;

function extract(buffer) {
  if ('CRILAYLA' !== buffer.slice(0, 0x8).toString()) return buffer;
  const uncompressSize = buffer.readUInt32LE(0x8);
  const headerOffset = buffer.readUInt32LE(0xC);
  const result = Buffer.allocUnsafe(uncompressSize + 0x100);
  for (let i = 0; i < 0x100; i++) result[i] = buffer[0x10 + headerOffset + i];
  let output = 0;
  const end = 0x100 + uncompressSize - 1;
  const lens = [ 2, 3, 5, 8 ];
  const reader = new BitReader(buffer.slice(0, buffer.length - 0x100));
  while (output < uncompressSize) {
    if (reader.getBits(1) > 0) {
      let offset = end - output + reader.getBits(13) + 3;
      let length = 3;
      let level;
      for (level = 0; level < lens.length; level++) {
        const lv = reader.getBits(lens[level]);
        length += lv;
        if (lv != ((1 << lens[level]) - 1)) break;
      }
      if (level === lens.length) {
        let lv;
        do {
          lv = reader.getBits(8);
          length += lv;
        } while (lv === 0xFF);
      }
      for (let i = 0; i < length; i++) {
        result[end - output] = result[offset--];
        output++;
      }
    } else {
      result[end - output] = reader.getBits(8);
      output++;
    }
  }
  return result;
}

class BitReader {
  constructor(buffer) {
    this.buffer = buffer;
    this.offset = buffer.length - 1;
    this.pool = 0;
    this.left = 0;
  }
  getBits(count) {
    let result = 0;
    let produced = 0;
    let round;
    while (produced < count) {
      if (this.left == 0) {
        this.pool = this.buffer[this.offset];
        this.left = 8;
        this.offset--;
      }
      if (this.left > (count - produced)) {
        round = count - produced;
      } else {
        round = this.left;
      }
      result <<= round;
      result |= ((this.pool >>> (this.left - round)) & ((1 << round) - 1));
      this.left -= round;
      produced += round;
    }
    return result;
  }
}