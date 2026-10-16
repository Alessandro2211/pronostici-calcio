// Ponte tra il programma e la pagina: la pagina riceve i risultati in diretta letti da ESPN.
// Esiste solo nell'app per computer: nel browser e sul telefono window.desktopApp non c'è.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopApp', {
  onLive(callback) {
    ipcRenderer.on('live-data', (_event, data) => callback(data));
    return ipcRenderer.invoke('live-get').then((data) => { if (data) callback(data); });
  },
});
