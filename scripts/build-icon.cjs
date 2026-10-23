// Rebuilds build/icon.ico from build/icon.svg (the exe, installer and
// first-launch icon; at runtime the app repaints its own in the theme colour).
//
//   npx electron scripts/build-icon.cjs
//
// Electron is used as the rasteriser since it's already a dependency. Each
// size is stored as a PNG entry, which Windows has read in .ico files since
// Vista.
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

const SIZES = [16, 24, 32, 48, 64, 128, 256];
const root = path.join(__dirname, "..");
const svg = fs.readFileSync(path.join(root, "build/icon.svg"), "utf8");

function toIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngs.length, 4);
  let offset = 6 + 16 * pngs.length;
  const entries = pngs.map(({ size, data }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // 0 means 256
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2); // palette
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false });
  await win.loadURL("about:blank");
  const pngs = [];
  for (const size of SIZES) {
    const dataUrl = await win.webContents.executeJavaScript(`(async () => {
      const img = new Image(${size}, ${size});
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(${JSON.stringify(svg)});
      await img.decode();
      const c = document.createElement("canvas");
      c.width = c.height = ${size};
      c.getContext("2d").drawImage(img, 0, 0, ${size}, ${size});
      return c.toDataURL("image/png");
    })()`);
    pngs.push({ size, data: Buffer.from(dataUrl.split(",")[1], "base64") });
  }
  fs.writeFileSync(path.join(root, "build/icon.ico"), toIco(pngs));
  console.log(`build/icon.ico: ${SIZES.join(", ")} px`);
  app.quit();
});
