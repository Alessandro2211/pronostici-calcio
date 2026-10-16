// Pronostici Calcio per Windows: una finestra che apre la pagina pubblicata su GitHub Pages.
// Dati, calcoli e impostazioni sono quelli della pagina, quindi si aggiornano da soli a ogni apertura.
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

const URL = 'https://alessandro2211.github.io/pronostici-calcio/';
const ORIGIN = new URL_(URL).origin;
function URL_(u) { return new globalThis.URL(u); }

app.setAppUserModelId('it.pronostici.calcio');
if (!app.requestSingleInstanceLock()) { app.quit(); }

let win = null, retry = null;

function load() {
  if (!win || win.isDestroyed()) return;
  win.loadURL(URL).catch(() => { /* gestito da did-fail-load */ });
}

function create() {
  win = new BrowserWindow({
    width: 1240, height: 880, minWidth: 380, minHeight: 560,
    backgroundColor: '#0A0D18', title: 'Pronostici Calcio', autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  });
  Menu.setApplicationMenu(null);

  // Senza internet: schermata di attesa, poi riprova ogni 15 secondi.
  win.webContents.on('did-fail-load', (_e, code, _desc, _url, isMainFrame) => {
    if (!isMainFrame || code === -3) return; // -3 = caricamento annullato
    win.loadFile(path.join(__dirname, 'offline.html')).catch(() => {});
    clearTimeout(retry);
    retry = setTimeout(load, 15000);
  });
  win.webContents.on('did-finish-load', () => { if (win.webContents.getURL().startsWith(ORIGIN)) clearTimeout(retry); });

  // Link esterni nel browser, non dentro l'app.
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(ORIGIN) && !url.startsWith('file://')) { e.preventDefault(); shell.openExternal(url); }
  });

  // Scorciatoie: F5 / Ctrl+R ricarica, Ctrl + e Ctrl - cambiano lo zoom, Ctrl+0 lo azzera.
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    const k = input.key, ctrl = input.control || input.meta;
    if (k === 'F5' || (ctrl && k.toLowerCase() === 'r')) { e.preventDefault(); load(); }
    else if (ctrl && (k === '+' || k === '=')) { e.preventDefault(); win.webContents.setZoomLevel(win.webContents.getZoomLevel() + 0.5); }
    else if (ctrl && k === '-') { e.preventDefault(); win.webContents.setZoomLevel(win.webContents.getZoomLevel() - 0.5); }
    else if (ctrl && k === '0') { e.preventDefault(); win.webContents.setZoomLevel(0); }
  });

  load();
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(create);
app.on('window-all-closed', () => app.quit());
