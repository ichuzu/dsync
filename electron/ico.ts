import type { NativeImage } from "electron";

/**
 * Packs an image into a multi-size .ico (PNG entries, readable by Windows
 * since Vista). Small sizes are resampled from the source so the taskbar,
 * Alt-Tab and title bar each get a crisp one.
 */
const SIZES = [16, 24, 32, 48, 64, 128, 256];

export function toIco(image: NativeImage): Buffer {
  const pngs = SIZES.map((size) => ({
    size,
    data: image.resize({ width: size, height: size, quality: "best" }).toPNG(),
  }));

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngs.length, 4);

  let offset = 6 + 16 * pngs.length;
  const entries = pngs.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // 0 means 256
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });

  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}
