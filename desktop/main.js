// App per Windows: apre la pagina pubblicata su GitHub Pages. Dati, tema e impostazioni sono quelli della pagina
// (le impostazioni restano salvate nell'app). Quando la pagina cambia, l'app la ricarica da sola.
const { app, BrowserWindow, shell, Menu, ipcMain } = require('electron');
const path = require('path');
const { fetchLive } = require('./live');

const APP_URL = 'https://alessandro2211.github.io/pronostici-calcio/';
const RELOAD_AFTER = 60 * 60 * 1000; // ricarica il codice della pagina se l'app torna in primo piano dopo un'ora
const RETRY_EVERY = 15 * 1000;

let win = null, lastLoad = 0, retryTimer = null;

// Risultati in diretta: il programma legge ESPN da solo (ogni 30 secondi se c'è una partita in corso, ogni minuto altrimenti)
// e li passa alla pagina.
let liveData = null, liveTimer = null, polling = false;
async function pollLive() {
  if (polling) return;
  polling = true;
  clearTimeout(liveTimer);
  let delay = 60 * 1000;
  try {
    liveData = await fetchLive();
    if (win && !win.isDestroyed()) win.webContents.send('live-data', liveData);
    if (liveData.matches.some((m) => m.status === 'IN_PLAY' || m.status === 'PAUSED')) delay = 30 * 1000;
  } catch { delay = 20 * 1000; /* senza rete riprova presto */ }
  polling = false;
  liveTimer = setTimeout(pollLive, delay);
}
ipcMain.handle('live-get', () => liveData);

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
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, preload: path.join(__dirname, 'preload.js') },
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
    pollLive(); // appena l'app torna in primo piano i risultati si aggiornano subito
  });
  win.webContents.on('did-finish-load', () => { if (liveData && !win.isDestroyed()) win.webContents.send('live-data', liveData); });
  load();
  pollLive();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(create);
  app.on('window-all-closed', () => app.quit());
}
