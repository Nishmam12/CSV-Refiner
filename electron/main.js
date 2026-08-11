const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");
const url = require("url");

if (!app.requestSingleInstanceLock()) app.quit();

let mainWindow = null;
let server = null;
let serverPort = null;

function log(...args) {
  console.log("[OSLTT]", ...args);
  try {
    const logPath = path.join(app.getPath("userData"), "osltt.log");
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, args.map((a) => String(a)).join(" ") + "\n");
  } catch (_) {}
}

function getOutDir() {
  // When asarUnpack is used, out lives in app.asar.unpacked/out
  const candidates = [
    path.join(__dirname, "..", "out"),
    path.join(__dirname, "..", "app.asar.unpacked", "out"),
    path.join(process.resourcesPath || "", "app.asar.unpacked", "out"),
    path.join(process.resourcesPath || "", "app", "out"),
    path.join(app.getAppPath(), "out"),
    path.join(app.getAppPath(), "..", "out"),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(path.join(p, "index.html"))) {
        log("Found outDir:", p);
        return p;
      }
    } catch (_) {}
  }
  const fallback = path.join(__dirname, "..", "out");
  log("Fallback outDir:", fallback, "exists:", fs.existsSync(path.join(fallback, "index.html")));
  return fallback;
}

function createStaticServer(rootDir) {
  return http.createServer((req, res) => {
    try {
      let parsed = url.parse(req.url);
      let pathname = decodeURIComponent(parsed.pathname || "/");
      if (pathname === "/" || pathname === "") pathname = "/index.html";
      let filePath = path.join(rootDir, pathname);
      if (pathname.endsWith("/") && !pathname.includes(".")) {
        filePath = path.join(rootDir, pathname, "index.html");
      }
      // Secure: prevent traversal outside rootDir
      const normalized = path.normalize(filePath);
      if (!normalized.startsWith(path.normalize(rootDir))) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }
      let exists = false;
      try {
        exists = fs.existsSync(normalized) && !fs.statSync(normalized).isDirectory();
      } catch (_) {
        exists = false;
      }
      if (!exists) {
        // SPA fallback
        const fallback = path.join(rootDir, "index.html");
        if (fs.existsSync(fallback)) {
          filePath = fallback;
        } else {
          res.writeHead(404);
          res.end("Not found: " + pathname);
          return;
        }
      } else {
        filePath = normalized;
      }
      fs.readFile(filePath, (err, data) => {
        if (err) {
          log("readFile error", filePath, err.message);
          res.writeHead(500);
          res.end("Read error");
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        const mime = {
          ".html": "text/html",
          ".js": "application/javascript",
          ".css": "text/css",
          ".json": "application/json",
          ".png": "image/png",
          ".jpg": "image/jpeg",
          ".svg": "image/svg+xml",
          ".woff2": "font/woff2",
          ".txt": "text/plain",
          ".map": "application/json",
        }[ext] || "application/octet-stream";
        res.writeHead(200, { "Content-Type": mime });
        res.end(data);
      });
    } catch (e) {
      log("server handler error", e.message);
      res.writeHead(500);
      res.end("Server error");
    }
  });
}

async function startServer() {
  const outDir = getOutDir();
  if (!fs.existsSync(path.join(outDir, "index.html"))) {
    log("No index.html in outDir, cannot start static server");
    return null;
  }
  return new Promise((resolve, reject) => {
    const srv = createStaticServer(outDir);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      server = srv;
      serverPort = addr.port;
      log("Static server listening on", `http://127.0.0.1:${addr.port}`, "serving", outDir);
      resolve(`http://127.0.0.1:${addr.port}`);
    });
    srv.on("error", (e) => {
      log("Server listen error", e.message);
      reject(e);
    });
  });
}

async function createWindow() {
  log("Creating window, appPath:", app.getAppPath(), "resourcesPath:", process.resourcesPath, "__dirname:", __dirname);
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1280,
    minHeight: 720,
    backgroundColor: "#09090b",
    title: "OSLTT Data Studio",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
  });

  // Debug: open DevTools in packaged app to diagnose blank screen (remove for final release if needed)
  // Comment out next line after verification
  // mainWindow.webContents.openDevTools();

  mainWindow.webContents.on("did-fail-load", (event, errorCode, errorDescription, validatedURL) => {
    log("did-fail-load", errorCode, errorDescription, validatedURL);
  });
  mainWindow.webContents.on("console-message", (event, level, message, line, sourceId) => {
    log("renderer console", level, message, `(${sourceId}:${line})`);
  });

  let startUrl = null;
  try {
    startUrl = await startServer();
  } catch (e) {
    log("startServer failed", e.message);
  }
  if (!startUrl) {
    startUrl = "http://localhost:3000";
    log("Falling back to", startUrl);
  }

  log("Loading URL:", startUrl);
  try {
    await mainWindow.loadURL(startUrl);
  } catch (e) {
    log("loadURL failed", e.message);
  }
  mainWindow.once("ready-to-show", () => {
    log("ready-to-show");
    mainWindow.show();
    mainWindow.focus();
  });
  // Fallback show after 2s in case ready-to-show never fires
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      log("Fallback show after timeout");
      mainWindow.show();
    }
  }, 2000);

  mainWindow.webContents.setWindowOpenHandler(({ url: u }) => {
    if (serverPort && u.startsWith(`http://127.0.0.1:${serverPort}`)) return { action: "allow" };
    if (u.startsWith("http://localhost:3000")) return { action: "allow" };
    log("Open external", u);
    shell.openExternal(u);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, navUrl) => {
    if (serverPort && navUrl.startsWith(`http://127.0.0.1:${serverPort}`)) return;
    if (navUrl.startsWith("http://localhost:3000")) return;
    log("will-navigate external block", navUrl);
    event.preventDefault();
    shell.openExternal(navUrl);
  });
}

app.whenReady().then(createWindow);

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on("window-all-closed", () => {
  if (server) server.close();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
