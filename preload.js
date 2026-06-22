// Minimal, safe bridge between renderer and main process.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cz1', {
  savePatch: (suggestedName, json) => ipcRenderer.invoke('patch:save', { suggestedName, json }),
  loadPatch: () => ipcRenderer.invoke('patch:load'),
  importSyx: () => ipcRenderer.invoke('syx:load'),
  exportSyx: (suggestedName, bytes) => ipcRenderer.invoke('syx:save', { suggestedName, bytes })
});
