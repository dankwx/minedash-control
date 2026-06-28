// ========================================
// AE2 Items/Storage relay server
// ----------------------------------------
// Recebe os dados do CC:tweaked (POST) e serve para o site (GET).
//
// Endpoints:
//   POST /api/items     <- ComputerCraft envia o payload de itens (ae2items.lua)
//   GET  /api/items     -> site lê { items: [...] }
//   POST /api/storage   <- (opcional) ComputerCraft envia dados das storage cells
//   GET  /api/storage   -> site lê { storage: { cells: [...] } }
//   GET  /health        -> healthcheck
//
// Zero dependencias. Rode com:  node ae2-server.js
// ========================================

import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.AE2_PORT ? Number(process.env.AE2_PORT) : 3003;
const HOST = "0.0.0.0";

// Persistencia simples em disco para sobreviver a reinicios
const DATA_FILE = path.join(__dirname, "ae2-data.json");

// Estado em memoria (ultimo payload recebido)
let state = {
  items: {
    timestamp: 0,
    totalTypes: 0,
    totalCount: 0,
    items: [],
  },
  storage: {
    usedBytes: 0,
    totalBytes: 0,
    percentUsed: 0,
    cells: [],
  },
  lastItemsUpdate: 0,
  lastStorageUpdate: 0,
};

// Carrega estado salvo, se existir
try {
  if (fs.existsSync(DATA_FILE)) {
    const saved = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    state = { ...state, ...saved };
    console.log("[ae2] estado carregado de", DATA_FILE);
  }
} catch (err) {
  console.warn("[ae2] nao foi possivel carregar estado salvo:", err.message);
}

let saveTimer = null;
function persist() {
  // debounce para nao escrever no disco a cada POST
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    fs.writeFile(DATA_FILE, JSON.stringify(state), (err) => {
      if (err) console.warn("[ae2] erro ao salvar estado:", err.message);
    });
  }, 2000);
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  setCors(res);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    let tooBig = false;
    req.on("data", (chunk) => {
      data += chunk;
      // protecao basica contra payload gigante (20 MB)
      if (data.length > 20 * 1024 * 1024) {
        tooBig = true;
        req.destroy();
      }
    });
    req.on("end", () => {
      if (tooBig) return reject(new Error("payload muito grande"));
      resolve(data);
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = (req.url || "").split("?")[0];
  const method = req.method || "GET";

  // Preflight CORS
  if (method === "OPTIONS") {
    setCors(res);
    res.writeHead(204);
    return res.end();
  }

  // ---- Healthcheck ----
  if (url === "/health" && method === "GET") {
    return sendJson(res, 200, {
      ok: true,
      lastItemsUpdate: state.lastItemsUpdate,
      lastStorageUpdate: state.lastStorageUpdate,
      itemTypes: state.items.items.length,
    });
  }

  // ---- Itens ----
  if (url === "/api/items") {
    if (method === "GET") {
      return sendJson(res, 200, state.items);
    }
    if (method === "POST") {
      try {
        const raw = await readBody(req);
        const payload = JSON.parse(raw);
        if (!payload || !Array.isArray(payload.items)) {
          return sendJson(res, 400, { error: "esperado { items: [...] }" });
        }
        state.items = payload;
        state.lastItemsUpdate = Date.now();
        persist();
        const ts = new Date().toLocaleTimeString("pt-BR");
        console.log(
          `[${ts}] /api/items <- ${payload.items.length} tipos, ${payload.totalCount || 0} itens`
        );
        return sendJson(res, 200, { ok: true, received: payload.items.length });
      } catch (err) {
        return sendJson(res, 400, { error: "JSON invalido: " + err.message });
      }
    }
  }

  // ---- Storage cells ----
  if (url === "/api/storage") {
    if (method === "GET") {
      return sendJson(res, 200, { storage: state.storage });
    }
    if (method === "POST") {
      try {
        const raw = await readBody(req);
        const payload = JSON.parse(raw);
        // aceita { storage: {...} } ou o objeto storage direto
        const storage = payload.storage || payload;
        if (!storage || !Array.isArray(storage.cells)) {
          return sendJson(res, 400, { error: "esperado { storage: { cells: [...] } }" });
        }
        state.storage = storage;
        state.lastStorageUpdate = Date.now();
        persist();
        const ts = new Date().toLocaleTimeString("pt-BR");
        console.log(`[${ts}] /api/storage <- ${storage.cells.length} cells`);
        return sendJson(res, 200, { ok: true, received: storage.cells.length });
      } catch (err) {
        return sendJson(res, 400, { error: "JSON invalido: " + err.message });
      }
    }
  }

  // ---- Nao encontrado ----
  return sendJson(res, 404, { error: "rota nao encontrada", path: url });
});

server.listen(PORT, HOST, () => {
  console.log("========================================");
  console.log("  AE2 relay server");
  console.log("========================================");
  console.log(`  Ouvindo em http://${HOST}:${PORT}`);
  console.log("  POST /api/items    (CC:tweaked -> servidor)");
  console.log("  GET  /api/items    (servidor -> site)");
  console.log("  GET  /api/storage  (servidor -> site)");
  console.log("========================================");
});
