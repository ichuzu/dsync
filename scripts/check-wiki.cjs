// Run against the Vite server: electron scripts/check-wiki.cjs
// Uses an isolated profile and hidden window; never changes the user's app data.
const { app, BrowserWindow } = require('electron');
const { mkdir, writeFile, mkdtemp, rm } = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
let profile;
const base = process.env.DSYNC_TEST_URL || 'http://127.0.0.1:8080';
const output = join(__dirname, '..', 'docs', 'design-previews');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(win, expression) {
  for (let i = 0; i < 120; i++) {
    if (await win.webContents.executeJavaScript(expression)) return;
    await pause(250);
  }
  throw new Error(`Timed out: ${expression}`);
}
async function run() {
  profile = await mkdtemp(join(tmpdir(), 'dsync-wiki-check-'));
  app.setPath('userData', profile);
  await app.whenReady();
  const win = new BrowserWindow({ width: 1440, height: 1200, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, offscreen: true } });
  const errors = [];
  const execute = win.webContents.executeJavaScript.bind(win.webContents);
  win.webContents.executeJavaScript = async code => {
    try { return await execute(code); }
    catch (error) { console.error('Failed browser check:', code); throw error; }
  };
  win.webContents.on('console-message', (event) => { if (event.level === 'error' && !event.message.includes('Failed to load resource')) errors.push(event.message); });
  await mkdir(output, { recursive: true });
  await win.loadURL(`${base}/designs`);
  await waitFor(win, `location.pathname === '/wiki'`);
  await win.loadURL(`${base}/wiki?game=230410`);
  await waitFor(win, `!!document.querySelector('.wiki-result')`);
  await waitFor(win, `Array.from(document.querySelectorAll('.wiki-result img')).some(i => i.naturalWidth > 0)`);
  await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.wiki-result')).find(b => b.textContent.includes('Iradite')).click()`);
  await waitFor(win, `document.querySelector('.wiki-prose')?.textContent.includes('Plains of Eidolon')`);
  await waitFor(win, `document.querySelector('.wiki-picture img')?.naturalWidth > 0`);
  await pause(500);
  await writeFile(join(output, 'warframe-wiki.png'), (await win.webContents.capturePage()).toPNG());
  await waitFor(win, `document.querySelector('.wiki-save') !== null`);
  await win.webContents.executeJavaScript(`document.querySelector('.wiki-save').click()`);
  await waitFor(win, `document.querySelector('.wiki-save').getAttribute('aria-pressed') === 'true'`);
  await win.webContents.reload();
  await waitFor(win, `!!document.querySelector('.wiki-result')`);
  await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.wiki-result')).find(b => b.textContent.includes('Iradite')).click()`);
  await waitFor(win, `document.querySelector('.wiki-save')?.getAttribute('aria-pressed') === 'true'`);
  await win.webContents.executeJavaScript(`const input = document.querySelector('.wiki-search input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Grokdrul'); input.dispatchEvent(new Event('input', {bubbles:true}));`);
  // No submit: results and thumbnails must appear while typing.
  await waitFor(win, `document.querySelector('.wiki-results button')?.textContent.includes('Grokdrul')`);
  await waitFor(win, `document.querySelector('.wiki-results button img')?.naturalWidth > 0`);
  await pause(500);
  await writeFile(join(output, 'wiki-search.png'), (await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript(`document.querySelector('.wiki-results button').click()`);
  await waitFor(win, `document.querySelector('.wiki-article-heading h2')?.textContent === 'Grokdrul'`);
  await waitFor(win, `!!document.querySelector('.wiki-prose')`);
  win.setSize(390, 844);
  await pause(300);
  const overflow = await win.webContents.executeJavaScript(`document.documentElement.scrollWidth > window.innerWidth`);
  if (overflow) throw new Error('Wiki overflows mobile viewport');
  await win.webContents.executeJavaScript(`document.querySelector('.wiki-back').click()`);
  await waitFor(win, `!!document.querySelector('.wiki-result')`);
  if (await win.webContents.executeJavaScript(`document.documentElement.scrollWidth > window.innerWidth`)) throw new Error('Search results overflow mobile viewport');
  win.setSize(1440, 1000);
  await win.webContents.executeJavaScript(`document.querySelector('[aria-label="Wiki game"]').click()`);
  await waitFor(win, `!!document.querySelector('[data-game-id="1086940"]')`);
  await win.webContents.executeJavaScript(`document.querySelector('[data-game-id="1086940"]').click()`);
  await waitFor(win, `document.querySelector('.game-wiki')?.getAttribute('aria-label') === "Baldur's Gate 3 wiki"`);
  await waitFor(win, `document.querySelector('.wiki-results')?.textContent.includes('Weapons')`);
  if (await win.webContents.executeJavaScript(`document.querySelector('.wiki-results').textContent.includes('Iradite')`)) throw new Error('Cross-game wiki results leaked');
  await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Edit saved times').click()`);
  await waitFor(win, `!!document.querySelector('[aria-label="Main story hours"]')`);
  await win.webContents.executeJavaScript(`{const input = document.querySelector('[aria-label="Main story hours"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '42'); input.dispatchEvent(new Event('input', {bubbles:true}));}`);
  await pause(100);
  await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Save times').click()`);
  await waitFor(win, `document.querySelector('[aria-label="Completion times"]')?.textContent.includes('42 h')`);
  await win.webContents.reload();
  await waitFor(win, `document.querySelector('[aria-label="Completion times"]')?.textContent.includes('42 h')`);
  await win.webContents.executeJavaScript(`document.querySelector('[aria-label="Wiki game"]').click()`);
  await waitFor(win, `!!document.querySelector('[data-game-id="1245620"]')`);
  await win.webContents.executeJavaScript(`document.querySelector('[data-game-id="1245620"]').click()`);
  await waitFor(win, `document.body.textContent.includes("In-app article search isn't connected for this game yet.")`);
  if (await win.webContents.executeJavaScript(`document.querySelector('[aria-label="Completion times"]').textContent.includes('42 h')`)) throw new Error('Times leaked across games');
  const storeLink = await win.webContents.executeJavaScript(`(async () => { const {openSteamStoreLink} = await import('/src/lib/steamLinks.ts'); let appid = null, prevented = false; window.dsync = {isDesktop:true, openStorePage:async id => {appid=id;}}; openSteamStoreLink({preventDefault(){prevented=true;}}, 1245620); await Promise.resolve(); delete window.dsync; return {appid,prevented}; })()`);
  if (storeLink.appid !== '1245620' || !storeLink.prevented) throw new Error('Steam store link did not hand off to the desktop bridge');
  await win.webContents.executeJavaScript(`window.dsync = {isDesktop:true, getRunningApp:async()=> '230410', getLocalLibrary:async()=>[], getSteamStatus:async()=>({installed:true,running:true,root:'test'}), onRunningAppChanged:fn=>{window.__testRunning=fn;return ()=>{};}, onLibraryChanged:()=>()=>{}, onDownloadsChanged:()=>()=>{}}; document.querySelector('nav a[href="/"]').click();`);
  await pause(200);
  await win.webContents.executeJavaScript(`document.querySelector('nav a[href="/wiki"]').click()`);
  await waitFor(win, `document.querySelector('.game-wiki')?.getAttribute('aria-label') === 'Warframe wiki'`);
  await win.webContents.executeJavaScript(`window.__testRunning('105600')`);
  await waitFor(win, `document.querySelector('.game-wiki')?.getAttribute('aria-label') === 'Terraria wiki'`);
  await win.webContents.executeJavaScript(`window.__testRunning(null)`);
  await waitFor(win, `document.querySelector('[aria-label="Wiki game"]')?.textContent.includes('Elden Ring')`);
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('PASS: visual search, bookmarks, mobile layout, BG3 switch without result leakage, per-game time persistence, unsupported-wiki state, desktop Steam store handoff, initial running game, game switching, and stopping a game.');
  win.destroy();
}
run().then(() => app.quit()).catch(error => { console.error(error); app.exit(1); });
app.on('will-quit', () => {
  // Only the unique temporary profile created above is eligible for cleanup.
  if (profile && profile.startsWith(join(tmpdir(), 'dsync-wiki-check-'))) rm(profile, { recursive: true, force: true }).catch(() => {});
});
