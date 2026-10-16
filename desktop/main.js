// App per Windows: apre la pagina pubblicata su GitHub Pages. Dati, tema e impostazioni sono quelli della pagina
// (le impostazioni restano salvate nell'app). Quando la pagina cambia, l'app la ricarica da sola.
const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');

const APP_URL = 'https://alessandro2211.github.io/pronostici-calcio/';
const RELOAD_AFTER = 60 * 60 * 1000; // ricarica il codice della pagina se l'app torna in primo piano dopo un'ora
const RETRY_EVERY = 15 * 1000;

let win = null, lastLoad = 0, retryTimer = null;

function load() {
  clearTimeout(retryTimer);
  lastLoad = Date.now();
  win.loadURL(APP_URL).catch(() => { /* gestito da did-fail-load */ });
}

function openOutside(url) {
  if (/^https?:\/\//i.test(url)) shell.openExternal(url);
}

function create() {
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({
    width: 1200, height: 850, minWidth: 360, minHeight: 500,
    backgroundColor: '#07161A', title: 'Pronostici Calcio Europa',
    icon: path.join(__dirname, 'icon.png'), autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.webContents.on('did-fail-load', (_e, code, _desc, _url, isMainFrame) => {
    if (!isMainFrame || code === -3) return; // -3 = caricamento annullato
    win.loadFile(path.join(__dirname, 'offline.html'));
    clearTimeout(retryTimer);
    retryTimer = setTimeout(load, RETRY_EVERY);
  });
  win.webContents.setWindowOpenHandler(({ url }) => { openOutside(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(APP_URL) && !url.startsWith('file:')) { e.preventDefault(); openOutside(url); }
  });
  win.on('focus', () => {
    if (win.webContents.getURL().startsWith(APP_URL) && Date.now() - lastLoad > RELOAD_AFTER) {
      lastLoad = Date.now();
      win.webContents.reloadIgnoringCache();
    }
  });
  load();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(create);
  app.on('window-all-closed', () => app.quit());
}
