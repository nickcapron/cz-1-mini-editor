// Electron main process for the CZ-1 MINI patch generator.
// Responsibilities:
//   - create the window
//   - grant Web MIDI (incl. SysEx) permission so the renderer can talk to the synth
//   - expose minimal file save/load over IPC for storing patches as JSON

const { app, BrowserWindow, ipcMain, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs/promises');

let mainWindow = null;

function grantMidi(permission) {
  return permission === 'midi' || permission === 'midiSysex';
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'CZ-1 MINI Patch Generator',
    backgroundColor: '#14161c',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true               // preload only needs contextBridge/ipcRenderer
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.removeMenu();

  // Defense in depth: this is a fully local, single-window app — it never opens
  // popups or navigates away, so deny both outright in case anything tries.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault());
}

app.whenReady().then(() => {
  // Web MIDI + SysEx require explicit permission grants in Electron's Chromium.
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((wc, permission, callback) => callback(grantMidi(permission)));
  ses.setPermissionCheckHandler((wc, permission) => grantMidi(permission));

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---- Patch file IPC -------------------------------------------------------

ipcMain.handle('patch:save', async (_evt, { suggestedName, json }) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save patch',
    defaultPath: suggestedName || 'patch.cz1.json',
    filters: [{ name: 'CZ-1 patch', extensions: ['cz1.json', 'json'] }]
  });
  if (canceled || !filePath) return { ok: false, canceled: true };
  await fs.writeFile(filePath, json, 'utf8');
  return { ok: true, filePath };
});

ipcMain.handle('patch:load', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Load patch',
    properties: ['openFile'],
    filters: [{ name: 'CZ-1 patch', extensions: ['cz1.json', 'json'] }]
  });
  if (canceled || !filePaths.length) return { ok: false, canceled: true };
  const json = await fs.readFile(filePaths[0], 'utf8');
  return { ok: true, filePath: filePaths[0], json };
});

// ---- Casio CZ .syx import/export (binary) ---------------------------------

ipcMain.handle('syx:load', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Casio CZ .syx',
    properties: ['openFile'],
    filters: [{ name: 'Casio CZ SysEx', extensions: ['syx'] }, { name: 'All files', extensions: ['*'] }]
  });
  if (canceled || !filePaths.length) return { ok: false, canceled: true };
  const buf = await fs.readFile(filePaths[0]);
  return { ok: true, filePath: filePaths[0], name: path.basename(filePaths[0]), bytes: [...buf] };
});

ipcMain.handle('syx:save', async (_evt, { suggestedName, bytes }) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Export .syx',
    defaultPath: suggestedName || 'patch.syx',
    filters: [{ name: 'Casio CZ SysEx', extensions: ['syx'] }]
  });
  if (canceled || !filePath) return { ok: false, canceled: true };
  await fs.writeFile(filePath, Buffer.from(bytes));
  return { ok: true, filePath };
});
