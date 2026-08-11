// Preload — keep context isolated. Expose minimal app info + file-backed store.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("oslttDesktop", {
  isDesktop: true,
  version: "0.1.0",
  storeLoad: (name) => ipcRenderer.invoke("osltt:store:load", name),
  storeSave: (name, data) => ipcRenderer.invoke("osltt:store:save", name, data),
  storeClear: (name) => ipcRenderer.invoke("osltt:store:clear", name),
});
