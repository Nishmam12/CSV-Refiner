// Preload — keep context isolated. Expose minimal app info if needed.
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("oslttDesktop", {
  isDesktop: true,
  version: "0.1.0",
});
