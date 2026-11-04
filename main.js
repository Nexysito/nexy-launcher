'use strict';

const { app, BrowserWindow, ipcMain, shell, dialog, Menu, screen, clipboard, nativeImage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');
const https = require('node:https');
const net = require('node:net');
const dns = require('node:dns');
const { execFile, spawn } = require('node:child_process');
const AdmZip = require('adm-zip');
const { Client } = require('minecraft-launcher-core');

const IS_DEV = process.argv.includes('--dev');
const SMOKE = process.argv.includes('--smoke');
const SMOKE_OUT = (() => {
  const index = process.argv.indexOf('--smoke-out');
  return index !== -1 ? path.resolve(process.argv[index + 1]) : null;
})();
const SMOKE_PAGE = (() => {
  const index = process.argv.indexOf('--smoke-page');
  const page = index !== -1 ? process.argv[index + 1] : '';
  return ['home', 'instances', 'mods', 'servers', 'content', 'ai', 'settings'].includes(page) ? page : null;
})();

/* Manifiesto público con la última versión publicada.
   Cámbialo por la URL de tu alojamiento (GitHub Releases, servidor propio…) una sola vez. */
const UPDATE_MANIFEST_URL = process.env.NEXY_UPDATE_URL
  || 'https://github.com/Nexysito/nexy-launcher/releases/latest/download/updates.json';
const UPDATE_CACHE_MS = 6 * 60 * 60 * 1000;

const INSTALL_DIR = app.isPackaged ? path.dirname(process.execPath) : __dirname;
const PORTABLE_DATA_DIR = path.join(INSTALL_DIR, 'data');

/* Guarda los datos junto al launcher para no ocupar %APPDATA%.
   Si la carpeta no permite escritura (por ejemplo, Program Files), se usa la predeterminada. */
function prepareUserData() {
  const directory = process.env.NEXY_USER_DATA
    ? path.resolve(process.env.NEXY_USER_DATA)
    : PORTABLE_DATA_DIR;
  try {
    fs.mkdirSync(directory, { recursive: true });
    const probe = path.join(directory, '.write-test');
    fs.writeFileSync(probe, '');
    fs.unlinkSync(probe);
    app.setPath('userData', directory);
  } catch (error) {
    console.error(`No se pudo usar "${directory}" para los datos; se usará la carpeta predeterminada.`, error);
  }
}

prepareUserData();

app.setName('NexyLauncher');
app.setAppUserModelId('net.nexy.launcher');

const DATA_DIR = app.getPath('userData');
const INSTANCES_DIR = path.join(DATA_DIR, 'instances');
const FILES = {
  settings: path.join(DATA_DIR, 'settings.json'),
  accounts: path.join(DATA_DIR, 'accounts.json'),
  servers: path.join(DATA_DIR, 'servers.json'),
  window: path.join(DATA_DIR, 'window-state.json'),
  manifest: path.join(DATA_DIR, 'cache', 'version_manifest.json')
};

const THEMES = ['violet', 'emerald', 'amber', 'azure', 'rose'];
const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/;
const VERSION_RE = /^[A-Za-z0-9._+-]{1,80}$/;
const SERVER_HOST_RE = /^(?:\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9._-]{1,253})(?::(\d{1,5}))?$/;
const PROJECT_ID_RE = /^[A-Za-z0-9_-]{2,64}$/;
const LOADER_IDS = ['vanilla', 'fabric', 'quilt', 'forge', 'neoforge'];
const LOADER_LABELS = {
  vanilla: 'Vanilla',
  fabric: 'Fabric',
  quilt: 'Quilt',
  forge: 'Forge',
  neoforge: 'NeoForge'
};
const LOADER_LABEL_IDS = {
  vanilla: 'vanilla',
  fabric: 'fabric',
  quilt: 'quilt',
  forge: 'forge',
  neoforge: 'neoforge'
};
const MODRINTH_API = 'https://api.modrinth.com/v2';
const CURSEFORGE_API = 'https://api.curseforge.com/v1';
const CURSEFORGE_GAME_ID = 432;
const CURSEFORGE_MOD_CLASS = 6;
const LOADER_CACHE_TTL = 10 * 60 * 1000;
const MAX_MOD_BYTES = 250 * 1024 * 1024;
const MAX_PACK_BYTES = 4 * 1024 * 1024 * 1024;
const MAX_PACK_ENTRY_BYTES = 1024 * 1024 * 1024;
const MAX_ASSET_BYTES = 64 * 1024 * 1024;

const PROGRESS_LABELS = {
  classes: 'Descargando librerías',
  'classes-main': 'Descargando librerías',
  assets: 'Descargando recursos',
  'assets-copy': 'Copiando recursos',
  natives: 'Preparando librerías nativas',
  'version-jar': 'Descargando cliente',
  'client-package': 'Preparando paquete de cliente',
  log4j: 'Preparando parches de seguridad',
  assetJson: 'Preparando índice de recursos'
};

const DOWNLOAD_LABELS = {
  classes: 'Librería',
  'classes-main': 'Librería',
  assets: 'Recurso',
  'asset-json': 'Índice de recursos',
  natives: 'Librería nativa',
  'version-jar': 'Cliente',
  'client-package': 'Paquete',
  log4j: 'Archivo de seguridad'
};

let mainWindow = null;
let settings = null;
let accounts = [];
let servers = [];
let javaCache = null;
let javaCacheAt = 0;
let javaInflight = null;
let activeLauncher = null;
let activeProcess = null;
let activeInstaller = null;
let activeDownloadController = null;
let currentLaunch = null;
let cancelRequested = false;
const loaderVersionsCache = new Map();

/* -------------------------------------------------------------------------- */
/*                                  Utilidades                                */
/* -------------------------------------------------------------------------- */

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readJson(file, fallback) {
  try {
    const content = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = `${file}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(temporary, file);
  } catch (error) {
    console.error(`No se pudo guardar ${path.basename(file)}:`, error);
  }
}

function ensureDir(directory) {
  try {
    fs.mkdirSync(directory, { recursive: true });
  } catch (error) {
    console.error(`No se pudo crear ${directory}:`, error);
  }
}

function totalMemoryGB() {
  return Math.max(2, Math.round(os.totalmem() / 1024 ** 3));
}

function supportsQuickPlay(version) {
  const match = /^1\.(\d+)(?:\.(\d+))?/.exec(version);
  if (!match) return true;
  const minor = Number(match[1]);
  const patch = Number(match[2] || 0);
  return minor > 20 || (minor === 20 && patch >= 0);
}

function splitServerAddress(address) {
  const value = String(address || '').trim();
  if (value.startsWith('[')) {
    const end = value.indexOf(']');
    if (end !== -1) {
      const host = value.slice(0, end + 1);
      const port = value.slice(end + 1).replace(/^:/, '') || '25565';
      return [host, port];
    }
  }
  const separator = value.lastIndexOf(':');
  if (separator > 0 && value.indexOf(':') === separator) {
    return [value.slice(0, separator), value.slice(separator + 1)];
  }
  return [value, '25565'];
}

/* ---------------------------- Server List Ping ---------------------------- */

function writeVarInt(value) {
  let current = Number(value) >>> 0;
  const bytes = [];
  do {
    let byte = current & 0x7f;
    current >>>= 7;
    if (current) byte |= 0x80;
    bytes.push(byte);
  } while (current);
  return Buffer.from(bytes);
}

function readVarInt(buffer, offset = 0) {
  let value = 0;
  let size = 0;
  while (size < 5 && offset + size < buffer.length) {
    const byte = buffer[offset + size];
    value |= (byte & 0x7f) << (7 * size);
    size++;
    if (!(byte & 0x80)) return { value: value >>> 0, size };
  }
  return null;
}

function minecraftString(value) {
  const data = Buffer.from(String(value), 'utf8');
  return Buffer.concat([writeVarInt(data.length), data]);
}

function minecraftPacket(id, payload = Buffer.alloc(0)) {
  const body = Buffer.concat([writeVarInt(id), payload]);
  return Buffer.concat([writeVarInt(body.length), body]);
}

function flattenMotd(description) {
  const pieces = [];
  const walk = (node, depth = 0) => {
    if (depth > 8 || node == null) return;
    if (typeof node === 'string') {
      pieces.push(node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item) => walk(item, depth + 1));
      return;
    }
    if (typeof node !== 'object') return;
    if (typeof node.text === 'string') pieces.push(node.text);
    if (typeof node.translate === 'string') pieces.push(node.translate);
    if (Array.isArray(node.with)) node.with.forEach((item) => walk(item, depth + 1));
    if (Array.isArray(node.extra)) node.extra.forEach((item) => walk(item, depth + 1));
  };
  walk(description);
  return pieces
    .join('')
    .replace(/§./g, '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

async function resolveServerTarget(host, port) {
  const explicit = String(port) !== '25565';
  const bare = host.replace(/^\[|\]$/g, '');
  if (explicit || /^[\d.]+$/.test(bare) || bare.includes(':') || /^localhost$/i.test(bare)) {
    return { host: bare, port: Number(port) };
  }
  try {
    const records = await dns.promises.resolveSrv(`_minecraft._tcp.${bare}`);
    const best = records.sort((a, b) => a.priority - b.priority || b.weight - a.weight)[0];
    if (best && best.name) return { host: String(best.name).replace(/\.$/, ''), port: Number(best.port) || 25565 };
  } catch {
    /* sin SRV: se usa la dirección original */
  }
  return { host: bare, port: Number(port) };
}

function pingMinecraftServer(address) {
  return new Promise((resolve) => {
    const normalized = normalizeAddress(address);
    if (!normalized) {
      resolve({ online: false, error: 'Dirección no válida.' });
      return;
    }
    const started = Date.now();
    let settled = false;
    let socket = null;
    let buffer = Buffer.alloc(0);

    const finish = (result) => {
      if (settled) return;
      settled = true;
      try {
        socket?.destroy();
      } catch {
        /* socket ya cerrado */
      }
      resolve(result);
    };

    resolveServerTarget(...splitServerAddress(normalized))
      .then((target) => {
        if (settled) return;
        socket = net.createConnection({ host: target.host, port: target.port });
        socket.setNoDelay(true);
        socket.setTimeout(5000);

        socket.on('connect', () => {
          const port = Buffer.alloc(2);
          port.writeUInt16BE(target.port, 0);
          const handshake = minecraftPacket(0, Buffer.concat([
            writeVarInt(0),
            minecraftString(target.host),
            port,
            writeVarInt(1)
          ]));
          socket.write(handshake);
          socket.write(minecraftPacket(0));
        });

        socket.on('data', (chunk) => {
          buffer = Buffer.concat([buffer, chunk]);
          const length = readVarInt(buffer, 0);
          if (!length || buffer.length < length.size + length.value) return;
          const body = buffer.subarray(length.size, length.size + length.value);
          const packetId = readVarInt(body, 0);
          if (!packetId || packetId.value !== 0) {
            finish({ online: false, error: 'Respuesta inesperada del servidor.' });
            return;
          }
          const stringLength = readVarInt(body, packetId.size);
          if (!stringLength) {
            finish({ online: false, error: 'Respuesta incompleta del servidor.' });
            return;
          }
          const start = packetId.size + stringLength.size;
          const raw = body.subarray(start, start + stringLength.value).toString('utf8');
          let data;
          try {
            data = JSON.parse(raw);
          } catch {
            finish({ online: false, error: 'El servidor devolvió datos no válidos.' });
            return;
          }
          const players = isPlainObject(data.players) ? data.players : {};
          const version = isPlainObject(data.version) ? data.version : {};
          finish({
            online: true,
            latency: Math.max(1, Date.now() - started),
            motd: flattenMotd(data.description) || 'Sin descripción',
            version: truncateText(version.name, 60),
            protocol: Number(version.protocol) || 0,
            players: {
              online: Math.max(0, Number(players.online) || 0),
              max: Math.max(0, Number(players.max) || 0)
            }
          });
        });

        socket.on('timeout', () => finish({ online: false, error: 'El servidor no respondió a tiempo.' }));
        socket.on('error', (error) => {
          const message = error.code === 'ENOTFOUND'
            ? 'No se pudo resolver la dirección.'
            : error.code === 'ECONNREFUSED'
              ? 'El servidor rechazó la conexión.'
              : 'No se pudo conectar con el servidor.';
          finish({ online: false, error: message });
        });
        socket.on('close', () => finish({ online: false, error: 'El servidor cerró la conexión.' }));
      })
      .catch(() => finish({ online: false, error: 'No se pudo conectar con el servidor.' }));
  });
}

function defaultSettings() {
  const total = totalMemoryGB();
  const max = total >= 24 ? 8 : total >= 16 ? 6 : total >= 8 ? 4 : 2;
  const freshRoot = path.join(DATA_DIR, '.minecraft');
  return {
    schema: 2,
    activeAccountId: null,
    gameRoot: freshRoot,
    javaPath: '',
    javaPaths: {},
    memory: { min: Math.min(2, Math.max(1, Math.floor(max / 2))), max },
    resolution: { width: 1280, height: 720, fullscreen: false },
    jvmArgs: '',
    gameArgs: '',
    minimizeOnLaunch: true,
    autoLogin: true,
    showSnapshots: false,
    theme: 'violet',
    lastVersion: '',
    lastLoader: 'vanilla',
    lastLoaderVersion: '',
    curseforgeApiKey: '',
    modProvider: 'modrinth',
    aiApiKey: '',
    aiBaseUrl: 'https://api.openai.com/v1',
    aiModel: 'gpt-4o-mini',
    aiAutoReadCrash: false,
    language: 'es',
    dismissedUpdateVersion: '',
    seenWelcome: false
  };
}

function sanitizeMemory(memory, base) {
  const total = totalMemoryGB();
  const ceiling = Math.max(2, Math.min(32, total - 1));
  const max = clamp(isPlainObject(memory) ? memory.max : base.max, 1, ceiling);
  const min = clamp(isPlainObject(memory) ? memory.min : base.min, 1, max);
  return { min, max };
}

function sanitizeAiBaseUrl(value) {
  const fallback = 'https://api.openai.com/v1';
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  try {
    const url = new URL(raw);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) return fallback;
    return `${url.origin}${url.pathname}`.replace(/\/+$/, '') || fallback;
  } catch {
    return fallback;
  }
}

function sanitizeResolution(resolution, base) {
  const source = isPlainObject(resolution) ? resolution : {};
  return {
    width: Math.round(clamp(source.width ?? base.width, 640, 7680)),
    height: Math.round(clamp(source.height ?? base.height, 480, 4320)),
    fullscreen: typeof source.fullscreen === 'boolean' ? source.fullscreen : base.fullscreen
  };
}

function normalizeInstanceSettings(raw) {
  const source = isPlainObject(raw) ? raw : {};
  const hasMemory = isPlainObject(source.memory)
    && (source.memory.min !== undefined || source.memory.max !== undefined);
  const hasResolution = isPlainObject(source.resolution)
    && (source.resolution.width !== undefined || source.resolution.height !== undefined || source.resolution.fullscreen !== undefined);

  return {
    memory: hasMemory ? sanitizeMemory(source.memory, settings?.memory || { min: 1, max: 4 }) : null,
    resolution: hasResolution ? sanitizeResolution(source.resolution, settings?.resolution || { width: 1280, height: 720, fullscreen: false }) : null,
    jvmArgs: typeof source.jvmArgs === 'string' ? source.jvmArgs.slice(0, 4000) : null,
    gameArgs: typeof source.gameArgs === 'string' ? source.gameArgs.slice(0, 4000) : null,
    javaPath: typeof source.javaPath === 'string'
      ? source.javaPath.trim().slice(0, 512)
      : null,
    minimizeOnLaunch: typeof source.minimizeOnLaunch === 'boolean' ? source.minimizeOnLaunch : null
  };
}

function effectiveInstanceSettings(instance) {
  const overrides = isPlainObject(instance?.settings) ? instance.settings : normalizeInstanceSettings(instance?.settings);
  const base = settings || defaultSettings();
  return {
    memory: isPlainObject(overrides.memory) ? overrides.memory : base.memory,
    resolution: isPlainObject(overrides.resolution) ? overrides.resolution : base.resolution,
    jvmArgs: typeof overrides.jvmArgs === 'string' ? overrides.jvmArgs : base.jvmArgs,
    gameArgs: typeof overrides.gameArgs === 'string' ? overrides.gameArgs : base.gameArgs,
    javaPath: typeof overrides.javaPath === 'string' ? overrides.javaPath : base.javaPath,
    minimizeOnLaunch: typeof overrides.minimizeOnLaunch === 'boolean' ? overrides.minimizeOnLaunch : base.minimizeOnLaunch !== false,
    overrides
  };
}

function sanitizeUsername(value) {
  const name = String(value ?? '').trim();
  return USERNAME_RE.test(name) ? name : null;
}

function splitArguments(value) {
  const input = String(value ?? '').trim();
  if (!input) return [];
  const argumentsList = [];
  const expression = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match;
  while ((match = expression.exec(input)) !== null) {
    argumentsList.push(match[1] ?? match[2] ?? match[3]);
  }
  return argumentsList;
}

function offlineUUID(name) {
  const hash = crypto.createHash('md5').update(`OfflinePlayer:${name}`, 'utf8').digest();
  hash[6] = (hash[6] & 0x0f) | 0x30;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function offlineAuthorization(name) {
  return {
    access_token: crypto.randomBytes(20).toString('hex'),
    client_token: crypto.randomBytes(20).toString('hex'),
    uuid: offlineUUID(name),
    name,
    user_properties: '{}',
    meta: { type: 'mojang', demo: false }
  };
}

function sanitizeLogLine(text) {
  return String(text)
    .replace(/(--accessToken\s+)\S+/gi, '$1****')
    .replace(/(--clientToken\s+)\S+/gi, '$1****')
    .replace(/("accessToken"\s*:\s*")[^"]+/gi, '$1****')
    .replace(/("clientToken"\s*:\s*")[^"]+/gi, '$1****')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

function humanError(error) {
  if (!error) return 'Error desconocido';
  if (typeof error === 'string') return error;
  return error.message || String(error);
}

function safeVersionId(value) {
  const id = String(value ?? '').trim();
  return VERSION_RE.test(id) ? id : null;
}

function normalizeLoader(value) {
  const key = String(value ?? '').trim().toLowerCase();
  return LOADER_IDS.includes(key) ? key : null;
}

function loaderVersionId(loader, mcVersion, loaderVersion) {
  const mc = safeVersionId(mcVersion);
  const version = safeVersionId(loaderVersion);
  if (!mc || !version) return null;
  if (loader === 'fabric') return `fabric-loader-${version}-${mc}`;
  if (loader === 'quilt') return `quilt-loader-${version}-${mc}`;
  if (loader === 'forge') return `${mc}-forge-${version}`;
  if (loader === 'neoforge') return mc === '1.20.1' ? `${mc}-forge-${version}` : `neoforge-${version}`;
  return mc;
}

function abortError() {
  const error = new Error('Operación cancelada.');
  error.name = 'AbortError';
  return error;
}

function assertHttpUrl(value, allowedDomains = []) {
  let parsed;
  try {
    parsed = new URL(String(value));
  } catch {
    throw new Error('La dirección de descarga no es válida.');
  }
  if (parsed.protocol !== 'https:') throw new Error('Solo se permiten descargas seguras (HTTPS).');
  if (parsed.username || parsed.password) throw new Error('La dirección de descarga no es válida.');
  if (allowedDomains.length) {
    const host = parsed.hostname.toLowerCase();
    const allowed = allowedDomains.some((domain) => host === domain || host.endsWith(`.${domain}`));
    if (!allowed) throw new Error(`El servidor de descargas no está permitido (${host}).`);
  }
  return parsed;
}

async function fetchWithTimeout(url, options = {}, responseType = 'json') {
  const timeout = options.timeout ?? 25000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const externalSignal = options.signal;
  const abort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) throw abortError();
    externalSignal.addEventListener('abort', abort, { once: true });
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'NexyLauncher/1.0 (Electron)',
        Accept: responseType === 'json' ? 'application/json' : '*/*',
        ...(options.headers || {})
      },
      signal: controller.signal,
      redirect: 'follow'
    });
    if (!response.ok) {
      let detail = '';
      try {
        detail = (await response.text()).replace(/\s+/g, ' ').trim().slice(0, 240);
      } catch {
        detail = '';
      }
      throw new Error(`El servidor respondió HTTP ${response.status}${detail ? `: ${detail}` : ''}.`);
    }
    if (responseType === 'text') return response.text();
    return response.json();
  } catch (error) {
    if (externalSignal?.aborted) throw abortError();
    if (error.name === 'AbortError' || controller.signal.aborted) {
      throw new Error('La conexión tardó demasiado. Revisa tu internet e inténtalo de nuevo.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
    if (externalSignal) externalSignal.removeEventListener('abort', abort);
  }
}

function fetchJson(url, options = {}) {
  return fetchWithTimeout(url, options, 'json');
}

function fetchText(url, options = {}) {
  return fetchWithTimeout(url, options, 'text');
}

const FABRIC_META_FALLBACK_IPS = ['104.16.0.1', '104.26.0.1'];

function fetchJsonViaIp(url, options = {}, ip) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const request = https.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: `${parsed.pathname}${parsed.search}`,
        method: 'GET',
        servername: parsed.hostname,
        lookup: (hostname, lookupOptions, callback) => {
          if (lookupOptions?.all) callback(null, [{ address: ip, family: 4 }]);
          else callback(null, ip, 4);
        },
        headers: {
          'User-Agent': 'NexyLauncher/1.0 (Electron)',
          Accept: 'application/json'
        },
        timeout: options.timeout ?? 25000
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`El servidor respondió HTTP ${response.statusCode || 0}.`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error('La respuesta del servidor no es JSON válido.'));
          }
        });
      }
    );

    const signal = options.signal;
    const abort = () => request.destroy(abortError());
    if (signal) {
      if (signal.aborted) {
        request.destroy(abortError());
        return;
      }
      signal.addEventListener('abort', abort, { once: true });
    }

    request.on('timeout', () => request.destroy(new Error('La conexión tardó demasiado.')));
    request.on('error', (error) => {
      if (signal?.aborted) reject(abortError());
      else reject(error);
    });
    request.on('close', () => {
      if (signal) signal.removeEventListener('abort', abort);
    });
    request.end();
  });
}

async function fetchFabricJson(url, options = {}) {
  try {
    return await fetchJson(url, { ...options, timeout: Math.min(options.timeout ?? 20000, 8000) });
  } catch (error) {
    if (options.signal?.aborted) throw abortError();
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw error;
    }
    if (parsed.hostname !== 'meta.fabricmc.net') throw error;

    let lastError = error;
    for (const ip of FABRIC_META_FALLBACK_IPS) {
      try {
        return await fetchJsonViaIp(url, options, ip);
      } catch (fallbackError) {
        if (options.signal?.aborted) throw abortError();
        lastError = fallbackError;
      }
    }
    throw new Error(`No se pudo conectar con Fabric Meta. ${humanError(lastError)}`);
  }
}

function hashFile(file, algorithm) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash(algorithm);
    const stream = fs.createReadStream(file);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function downloadFile(url, destination, options = {}) {
  assertHttpUrl(url, options.allowedDomains);
  const maxBytes = options.maxBytes || MAX_MOD_BYTES;
  const controller = new AbortController();
  const abort = () => controller.abort();
  const signal = options.signal;
  if (signal) {
    if (signal.aborted) throw abortError();
    signal.addEventListener('abort', abort, { once: true });
  }

  activeDownloadController = controller;
  const temporary = `${destination}.part`;
  let handle = null;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'NexyLauncher/1.0 (Electron)',
        Accept: '*/*',
        ...(options.headers || {})
      },
      signal: controller.signal,
      redirect: 'follow'
    });
    if (!response.ok) throw new Error(`No se pudo descargar el archivo (HTTP ${response.status}).`);

    const total = Number(response.headers.get('content-length')) || 0;
    if (total > maxBytes) throw new Error('El archivo es demasiado grande.');

    ensureDir(path.dirname(destination));
    handle = await fs.promises.open(temporary, 'w');
    const reader = response.body?.getReader();
    if (!reader) throw new Error('El servidor no envió ningún contenido.');

    let received = 0;
    let lastProgress = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (controller.signal.aborted) throw abortError();
      received += value.byteLength;
      if (received > maxBytes) throw new Error('El archivo supera el tamaño máximo permitido.');
      await handle.write(value);
      const now = Date.now();
      if (typeof options.onProgress === 'function' && (now - lastProgress > 180 || (total && received >= total))) {
        lastProgress = now;
        options.onProgress({
          received,
          total,
          percent: total ? Math.min(100, Math.round((received / total) * 100)) : null
        });
      }
    }

    await handle.close();
    handle = null;
    if (!received) throw new Error('El archivo descargado está vacío.');

    if (options.sha1) {
      const actual = await hashFile(temporary, 'sha1');
      if (actual.toLowerCase() !== String(options.sha1).toLowerCase()) {
        throw new Error('La verificación de seguridad de la descarga falló (SHA-1).');
      }
    }
    if (options.sha512) {
      const actual = await hashFile(temporary, 'sha512');
      if (actual.toLowerCase() !== String(options.sha512).toLowerCase()) {
        throw new Error('La verificación de seguridad de la descarga falló (SHA-512).');
      }
    }

    await fs.promises.rm(destination, { force: true });
    await fs.promises.rename(temporary, destination);
    return { size: received, total };
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    await fs.promises.rm(temporary, { force: true }).catch(() => {});
    if (signal?.aborted || error.name === 'AbortError') throw abortError();
    throw error;
  } finally {
    if (signal) signal.removeEventListener('abort', abort);
    if (activeDownloadController === controller) activeDownloadController = null;
  }
}

function versionJsonPath(id, gameRoot = null) {
  const safe = safeVersionId(id);
  return safe ? path.join(gamePaths(gameRoot).versions, safe, `${safe}.json`) : null;
}

function versionInstalled(id, gameRoot = null) {
  const file = versionJsonPath(id, gameRoot);
  return Boolean(file && fs.existsSync(file));
}

function readLoaderMarker(id, gameRoot = null) {
  const safe = safeVersionId(id);
  if (!safe) return null;
  const file = path.join(gamePaths(gameRoot).versions, safe, 'nexy-loader.json');
  const data = readJson(file, null);
  return isPlainObject(data) ? data : null;
}

function writeLoaderMarker(id, loader, loaderVersion, mcVersion, gameRoot = null) {
  const safe = safeVersionId(id);
  if (!safe) return;
  const directory = path.join(gamePaths(gameRoot).versions, safe);
  ensureDir(directory);
  writeJson(path.join(directory, 'nexy-loader.json'), {
    loader,
    loaderVersion: safeVersionId(loaderVersion) || '',
    mcVersion: safeVersionId(mcVersion) || '',
    installedAt: new Date().toISOString()
  });
}

function versionLoaderInfo(id, metadata, gameRoot = null) {
  const marker = readLoaderMarker(id, gameRoot);
  const markerId = normalizeLoader(marker?.loader);
  const inherited = typeof metadata?.inheritsFrom === 'string' ? metadata.inheritsFrom.trim() : '';
  const base = inherited || safeVersionId(marker?.mcVersion) || null;

  if (markerId && markerId !== 'vanilla') {
    return {
      id: markerId,
      label: LOADER_LABELS[markerId],
      version: safeVersionId(marker?.loaderVersion) || null,
      base
    };
  }

  const label = detectLoader(id, metadata);
  const labelId = label ? LOADER_LABEL_IDS[label.toLowerCase()] || null : null;
  return { id: labelId, label, version: null, base };
}

function normalizeAddress(value) {
  const address = String(value ?? '').trim();
  if (!SERVER_HOST_RE.test(address)) return null;
  const match = SERVER_HOST_RE.exec(address);
  if (match && match[1] && (Number(match[1]) < 1 || Number(match[1]) > 65535)) return null;
  return address;
}

function sanitizeInstanceName(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);
}

function sanitizeInstanceDescription(value) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 500);
}

function sanitizeInstanceCover(value) {
  if (typeof value !== 'string') return '';
  const raw = value.trim();
  if (!raw || raw.length > 1_200_000) return '';
  const text = raw.replace(/\s+/g, '');
  return /^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/=]+$/i.test(text) ? text : '';
}

function instanceSlug(name) {
  const slug = String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[-._]+|[-._]+$/g, '')
    .slice(0, 32);
  return slug || 'instancia';
}

function uniqueInstanceDirectory(name) {
  ensureDir(INSTANCES_DIR);
  const base = instanceSlug(name);
  let candidate = path.join(INSTANCES_DIR, base);
  let index = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(INSTANCES_DIR, `${base}-${index}`);
    index += 1;
  }
  return candidate;
}

function activeInstance() {
  if (!settings) return null;
  const instances = settings.instances || [];
  return instances.find((instance) => instance.id === settings.activeInstanceId) || instances[0] || null;
}

function instanceMarkerPath(root) {
  return path.join(root, '.nexy-instance.json');
}

function writeInstanceMarker(instance) {
  try {
    writeJson(instanceMarkerPath(instance.gameRoot), {
      id: instance.id,
      name: instance.name,
      createdAt: instance.createdAt
    });
  } catch {
    /* la instancia sigue siendo válida aunque no se pueda escribir el marcador */
  }
}

function normalizeInstances(rawSettings) {
  const fallbackRoot = settings.gameRoot;
  const source = Array.isArray(rawSettings?.instances) ? rawSettings.instances : [];
  const instances = [];
  const seenIds = new Set();
  const seenNames = new Set();
  const seenRoots = new Set();

  const push = (instance) => {
    const nameKey = instance.name.toLowerCase();
    const rootKey = instance.gameRoot.toLowerCase();
    if (seenNames.has(nameKey) || seenRoots.has(rootKey)) return false;
    seenNames.add(nameKey);
    seenRoots.add(rootKey);
    instances.push(instance);
    return true;
  };

  for (const item of source) {
    if (!isPlainObject(item)) continue;
    const name = sanitizeInstanceName(item.name);
    const root = typeof item.gameRoot === 'string' && path.isAbsolute(item.gameRoot)
      ? path.resolve(item.gameRoot)
      : '';
    if (!name || !root) continue;

    const validId = typeof item.id === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(item.id) && !seenIds.has(item.id);
    const id = validId ? item.id : crypto.randomUUID();
    seenIds.add(id);

    push({
      id,
      name,
      gameRoot: root,
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
      lastPlayedAt: typeof item.lastPlayedAt === 'string' ? item.lastPlayedAt : null,
      version: safeVersionId(item.version ?? item.lastVersion) || '',
      loader: LOADER_IDS.includes(item.loader ?? item.lastLoader) ? (item.loader ?? item.lastLoader) : 'vanilla',
      loaderVersion: safeVersionId(item.loaderVersion ?? item.lastLoaderVersion) || '',
      description: sanitizeInstanceDescription(item.description),
      cover: sanitizeInstanceCover(item.cover),
      settings: normalizeInstanceSettings(item.settings)
    });
  }

  if (!instances.length) {
    push({
      id: crypto.randomUUID(),
      name: 'Principal',
      gameRoot: path.resolve(fallbackRoot),
      createdAt: new Date().toISOString(),
      lastPlayedAt: null,
      version: settings.lastVersion || '',
      loader: settings.lastLoader || 'vanilla',
      loaderVersion: settings.lastLoaderVersion || '',
      description: '',
      cover: '',
      settings: normalizeInstanceSettings(null)
    });
  }

  settings.instances = instances;
  settings.activeInstanceId = instances.some((instance) => instance.id === settings.activeInstanceId)
    ? settings.activeInstanceId
    : instances[0].id;
  settings.gameRoot = activeInstance().gameRoot;
}

function switchInstance(id) {
  const target = (settings.instances || []).find((instance) => instance.id === id);
  if (!target) throw new Error('La instancia no existe.');

  settings.activeInstanceId = target.id;
  settings.gameRoot = target.gameRoot;
  settings.lastVersion = target.version || '';
  settings.lastLoader = target.loader || 'vanilla';
  settings.lastLoaderVersion = target.loaderVersion || '';
  saveSettings();
  ensureGameDirectories();
  return target;
}

async function instanceDetails(instance) {
  const countEntries = async (directory, predicate) => {
    try {
      const entries = await fs.promises.readdir(directory, { withFileTypes: true });
      return entries.filter(predicate).length;
    } catch {
      return 0;
    }
  };

  return {
    ...instance,
    effectiveSettings: effectiveInstanceSettings(instance),
    exists: fs.existsSync(instance.gameRoot),
    versions: await countEntries(
      path.join(instance.gameRoot, 'versions'),
      (entry) => entry.isDirectory() && VERSION_RE.test(entry.name)
    ),
    mods: await countEntries(
      path.join(instance.gameRoot, 'mods'),
      (entry) => entry.isFile() && /\.jar(?:\.disabled)?$/i.test(entry.name)
    ),
    worlds: await countEntries(path.join(instance.gameRoot, 'saves'), (entry) => entry.isDirectory())
  };
}

async function listInstances() {
  return Promise.all((settings.instances || []).map((instance) => instanceDetails(instance)));
}

async function instanceState() {
  return {
    settings: publicSettings(),
    instances: await listInstances(),
    activeInstanceId: settings.activeInstanceId,
    paths: gamePaths(),
    localVersions: await listLocalVersions(),
    mods: await listMods()
  };
}

function gamePaths(gameRoot = null) {
  const root = typeof gameRoot === 'string' && gameRoot
    ? gameRoot
    : activeInstance()?.gameRoot || settings.gameRoot;
  return {
    gameRoot: root,
    mods: path.join(root, 'mods'),
    versions: path.join(root, 'versions'),
    logs: path.join(root, 'logs'),
    saves: path.join(root, 'saves'),
    resourcePacks: path.join(root, 'resourcepacks'),
    shaderPacks: path.join(root, 'shaderpacks')
  };
}

function ensureGameDirectories() {
  const paths = gamePaths();
  for (const directory of [paths.gameRoot, paths.mods, paths.versions, paths.logs, paths.saves]) {
    ensureDir(directory);
  }
}

function saveSettings() {
  writeJson(FILES.settings, settings);
}

function publicSettings() {
  const { aiApiKey, ...rest } = settings;
  return { ...rest, aiApiKeySet: Boolean(aiApiKey) };
}

/* -------------------------------------------------------------------------- */
/*                                 Arranque                                   */
/* -------------------------------------------------------------------------- */

function loadData() {
  const defaults = defaultSettings();

  const rawSettings = readJson(FILES.settings, {});
  const rawAccounts = readJson(FILES.accounts, []);
  const rawServers = readJson(FILES.servers, []);

  accounts = Array.isArray(rawAccounts)
    ? rawAccounts
        .filter((account) => isPlainObject(account) && typeof account.id === 'string' && sanitizeUsername(account.name))
        .map((account) => ({
          id: account.id,
          name: String(account.name).trim(),
          type: 'offline',
          createdAt: typeof account.createdAt === 'string' ? account.createdAt : new Date().toISOString(),
          lastUsed: typeof account.lastUsed === 'string' ? account.lastUsed : null
        }))
    : [];

  const unique = new Map();
  for (const account of accounts) {
    if (!unique.has(account.name.toLowerCase())) unique.set(account.name.toLowerCase(), account);
  }
  accounts = [...unique.values()];

  servers = Array.isArray(rawServers)
    ? rawServers
        .filter((server) => isPlainObject(server) && normalizeAddress(server.address))
        .map((server) => ({
          id: typeof server.id === 'string' ? server.id : crypto.randomUUID(),
          name: String(server.name || 'Servidor').slice(0, 40),
          address: normalizeAddress(server.address),
          createdAt: typeof server.createdAt === 'string' ? server.createdAt : new Date().toISOString()
        }))
    : [];

  settings = {
    ...defaults,
    ...(isPlainObject(rawSettings) ? rawSettings : {}),
    memory: sanitizeMemory(rawSettings?.memory, defaults.memory),
    resolution: sanitizeResolution(rawSettings?.resolution, defaults.resolution)
  };

  settings.theme = THEMES.includes(settings.theme) ? settings.theme : defaults.theme;
  settings.language = settings.language === 'en' ? 'en' : 'es';
  settings.javaPath = typeof settings.javaPath === 'string' ? settings.javaPath.slice(0, 512) : '';
  settings.javaPaths = {};
  if (isPlainObject(rawSettings?.javaPaths)) {
    for (const [key, value] of Object.entries(rawSettings.javaPaths)) {
      const major = Number(key);
      if (!Number.isInteger(major) || major < 8 || major > 99) continue;
      if (typeof value !== 'string' || !path.isAbsolute(value)) continue;
      settings.javaPaths[String(major)] = value.slice(0, 512);
    }
  }
  settings.jvmArgs = typeof settings.jvmArgs === 'string' ? settings.jvmArgs.slice(0, 4000) : '';
  settings.gameArgs = typeof settings.gameArgs === 'string' ? settings.gameArgs.slice(0, 4000) : '';
  settings.minimizeOnLaunch = settings.minimizeOnLaunch !== false;
  settings.autoLogin = settings.autoLogin !== false;
  settings.showSnapshots = settings.showSnapshots === true;
  settings.lastVersion = safeVersionId(settings.lastVersion) || '';
  settings.lastLoader = LOADER_IDS.includes(settings.lastLoader) ? settings.lastLoader : 'vanilla';
  settings.lastLoaderVersion = safeVersionId(settings.lastLoaderVersion) || '';
  settings.curseforgeApiKey = typeof settings.curseforgeApiKey === 'string' ? settings.curseforgeApiKey.trim().slice(0, 200) : '';
  settings.aiApiKey = typeof settings.aiApiKey === 'string' ? settings.aiApiKey.trim().slice(0, 500) : '';
  settings.aiBaseUrl = sanitizeAiBaseUrl(settings.aiBaseUrl);
  settings.aiModel = typeof settings.aiModel === 'string' && settings.aiModel.trim()
    ? settings.aiModel.trim().slice(0, 120)
    : defaults.aiModel;
  settings.aiAutoReadCrash = settings.aiAutoReadCrash === true;
  settings.modProvider = ['modrinth', 'curseforge'].includes(settings.modProvider) ? settings.modProvider : 'modrinth';
  settings.gameRoot = typeof settings.gameRoot === 'string' && path.isAbsolute(settings.gameRoot)
    ? settings.gameRoot
    : defaults.gameRoot;
  normalizeInstances(rawSettings);
  settings.activeAccountId = accounts.some((account) => account.id === settings.activeAccountId)
    ? settings.activeAccountId
    : null;

  if (!fs.existsSync(FILES.settings)) saveSettings();
  ensureGameDirectories();
}

function activeAccount() {
  return accounts.find((account) => account.id === settings.activeAccountId) || null;
}

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function broadcastJava() {
  if (javaCache) sendToRenderer('system:java', javaCache);
}

/* -------------------------------------------------------------------------- */
/*                                  Ventana                                   */
/* -------------------------------------------------------------------------- */

function loadWindowState() {
  const saved = readJson(FILES.window, {});
  const display = screen.getPrimaryDisplay().workArea;
  const width = clamp(saved.width || 1280, 1040, Math.max(1040, display.width));
  const height = clamp(saved.height || 800, 680, Math.max(680, display.height));
  let x = Number.isFinite(saved.x) ? saved.x : Math.round(display.x + (display.width - width) / 2);
  let y = Number.isFinite(saved.y) ? saved.y : Math.round(display.y + (display.height - height) / 2);

  const visibleOnSomeDisplay = screen.getAllDisplays().some((candidate) => {
    const area = candidate.workArea;
    return x + width > area.x + 40 && x < area.x + area.width - 40
      && y + height > area.y + 20 && y < area.y + area.height - 20;
  });

  if (!visibleOnSomeDisplay) {
    x = Math.round(display.x + (display.width - width) / 2);
    y = Math.round(display.y + (display.height - height) / 2);
  }

  return { width, height, x, y, maximized: saved.maximized === true };
}

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const bounds = mainWindow.isMaximized() ? mainWindow.getNormalBounds() : mainWindow.getBounds();
  writeJson(FILES.window, {
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    maximized: mainWindow.isMaximized()
  });
}

function createWindow() {
  const state = loadWindowState();

  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 1040,
    minHeight: 680,
    frame: false,
    show: false,
    backgroundColor: '#080a0f',
    title: 'NexyLauncher',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      devTools: IS_DEV || SMOKE
    }
  });

  if (state.maximized) mainWindow.maximize();

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    sendToRenderer('window:maximized', mainWindow.isMaximized());
    if (SMOKE) {
      setTimeout(async () => {
        try {
          if (SMOKE_PAGE) {
            await mainWindow.webContents.executeJavaScript(
              `document.querySelector('.rail-btn[data-page="${SMOKE_PAGE}"]')?.click(); true;`
            );
            await new Promise((resolve) => setTimeout(resolve, 900));
          }
          const image = await mainWindow.webContents.capturePage();
          const output = SMOKE_OUT || path.join(process.cwd(), 'smoke.png');
          fs.mkdirSync(path.dirname(output), { recursive: true });
          fs.writeFileSync(output, image.toPNG());
          console.log(`[smoke] Captura guardada en ${output}`);
        } catch (error) {
          console.error('[smoke] Error al capturar:', error);
        } finally {
          app.quit();
        }
      }, 3200);
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) event.preventDefault();
  });

  mainWindow.webContents.on('console-message', (event, level, message) => {
    if (IS_DEV || SMOKE) {
      const label = ['debug', 'info', 'warning', 'error'][level] || 'log';
      console.log(`[renderer:${label}] ${message}`);
    }
  });

  mainWindow.on('maximize', () => {
    sendToRenderer('window:maximized', true);
    applyWindowZoom();
  });
  mainWindow.on('unmaximize', () => {
    sendToRenderer('window:maximized', false);
    applyWindowZoom();
  });

  /* En pantalla completa o maximizado la interfaz se veía pequeña:
     se agranda un poco sin tocar el tamaño de ventana normal. */
  function applyWindowZoom() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const zoom = mainWindow.isMaximized() || mainWindow.isFullScreen() ? 1.06 : 1;
    mainWindow.webContents.setZoomFactor(zoom);
  }

  mainWindow.on('enter-full-screen', applyWindowZoom);
  mainWindow.on('leave-full-screen', applyWindowZoom);
  mainWindow.webContents.on('did-finish-load', applyWindowZoom);
  mainWindow.on('close', saveWindowState);
  mainWindow.on('closed', () => { mainWindow = null; });
}

/* -------------------------------------------------------------------------- */
/*                              Detección de Java                             */
/* -------------------------------------------------------------------------- */

function collectJavaPathsFrom(directory, depth, collected, budget) {
  if (budget.visited > 220 || depth < 0) return;
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }

  budget.visited++;
  const exe = path.join(directory, process.platform === 'win32' ? 'java.exe' : 'bin/java');
  const windowsExe = path.join(directory, 'bin', 'java.exe');
  const unixExe = path.join(directory, 'bin', 'java');

  if (fs.existsSync(windowsExe)) collected.add(windowsExe);
  if (fs.existsSync(unixExe)) collected.add(unixExe);
  if (fs.existsSync(exe)) collected.add(exe);

  if (collected.has(windowsExe) || collected.has(unixExe)) return;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (/^(node_modules|\.git|\.cache|logs?)$/i.test(entry.name)) continue;
    collectJavaPathsFrom(path.join(directory, entry.name), depth - 1, collected, budget);
  }
}

function candidateJavaPaths() {
  const found = new Set();
  const exe = process.platform === 'win32' ? 'java.exe' : 'bin/java';

  if (process.env.JAVA_HOME) {
    const fromHome = path.join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
    if (fs.existsSync(fromHome)) found.add(fromHome);
  }

  for (const entry of String(process.env.PATH || '').split(path.delimiter)) {
    if (!entry) continue;
    const candidate = path.join(entry.replace(/^"|"$/g, ''), exe);
    if (fs.existsSync(candidate)) found.add(candidate);
  }

  if (process.platform !== 'win32') {
    for (const root of ['/usr/lib/jvm', '/Library/Java/JavaVirtualMachines']) {
      if (fs.existsSync(root)) collectJavaPathsFrom(root, 2, found, { visited: 0 });
    }
  } else {
    const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    const userProfile = process.env.USERPROFILE || os.homedir();
    const appData = process.env.APPDATA || path.join(userProfile, 'AppData', 'Roaming');

    const roots = [
      path.join(programFiles, 'Java'),
      path.join(programFiles, 'Eclipse Adoptium'),
      path.join(programFiles, 'Eclipse Foundation'),
      path.join(programFiles, 'Microsoft'),
      path.join(programFiles, 'Zulu'),
      path.join(programFiles, 'BellSoft'),
      path.join(programFiles, 'Amazon Corretto'),
      path.join(programFiles, 'GraalVM'),
      path.join(programFiles, 'Semeru'),
      path.join(programFilesX86, 'Java'),
      path.join(programFilesX86, 'Eclipse Adoptium'),
      path.join(localAppData, 'Programs', 'Eclipse Adoptium'),
      path.join(localAppData, 'Programs', 'Microsoft'),
      path.join(userProfile, '.jdks'),
      path.join(appData, '.minecraft', 'runtime'),
      path.join(DATA_DIR, '.minecraft', 'runtime'),
      path.join(settings?.gameRoot || '', 'runtime')
    ];

    for (const root of roots) {
      if (root && fs.existsSync(root)) collectJavaPathsFrom(root, 4, found, { visited: 0 });
    }
  }

  const list = [...found];
  for (const saved of Object.values(settings?.javaPaths || {})) {
    if (saved && !list.some((item) => item.toLowerCase() === saved.toLowerCase())) list.unshift(saved);
  }
  const manual = settings?.javaPath;
  if (manual && !list.some((item) => item.toLowerCase() === manual.toLowerCase())) {
    list.unshift(manual);
  }
  return list.slice(0, 28);
}

function inspectJavaPath(candidate) {
  return new Promise((resolve) => {
    if (!candidate) return resolve(null);
    let javaPath = candidate;
    try {
      if (path.basename(javaPath).toLowerCase() === 'javaw.exe') {
        const consoleVariant = path.join(path.dirname(javaPath), 'java.exe');
        if (fs.existsSync(consoleVariant)) javaPath = consoleVariant;
      }
      if (path.isAbsolute(javaPath)) {
        javaPath = fs.realpathSync.native(javaPath);
        if (!fs.statSync(javaPath).isFile()) return resolve(null);
      }
    } catch {
      return resolve(null);
    }

    const executable = path.basename(javaPath).toLowerCase();
    if (path.isAbsolute(javaPath) && !/^java(w)?(\.exe)?$/.test(executable)) return resolve(null);

    execFile(javaPath, ['-version'], { timeout: 7000, windowsHide: true, maxBuffer: 128 * 1024 }, (error, stdout, stderr) => {
      if (error && !stderr) return resolve(null);
      const output = `${stdout || ''}\n${stderr || ''}`;
      const match = /version "([^"]+)"/i.exec(output);
      if (!match) return resolve(null);
      const version = match[1];
      const major = version.startsWith('1.') ? Number(version.split('.')[1]) : Number(version.split('.')[0]);
      if (!Number.isFinite(major)) return resolve(null);

      let vendor = 'Java';
      const label = output.toLowerCase();
      const lowerPath = javaPath.toLowerCase();
      if (/temurin|adoptium/.test(label) || /adoptium|temurin/.test(lowerPath)) vendor = 'Eclipse Temurin';
      else if (/microsoft/.test(label) || /microsoft/.test(lowerPath)) vendor = 'Microsoft OpenJDK';
      else if (/zulu/.test(label) || /zulu/.test(lowerPath)) vendor = 'Azul Zulu';
      else if (/corretto/.test(label) || /corretto/.test(lowerPath)) vendor = 'Amazon Corretto';
      else if (/graalvm/.test(label) || /graalvm/.test(lowerPath)) vendor = 'GraalVM';
      else if (/liberica|bellsoft/.test(label) || /bellsoft|liberica/.test(lowerPath)) vendor = 'Liberica JDK';
      else if (/semeru|ibm/.test(label)) vendor = 'IBM Semeru';
      else if (/oracle/.test(label) || /oracle|javapath/.test(lowerPath)) vendor = 'Oracle Java';
      else if (/openjdk/.test(label)) vendor = 'OpenJDK';
      if (/java-runtime|\.minecraft[\\/]runtime/.test(lowerPath)) vendor = 'Mojang Runtime';

      resolve({
        path: javaPath,
        version,
        major,
        vendor,
        bits: /64-bit|64 bit/i.test(output) ? 64 : (/32-bit|32 bit/i.test(output) ? 32 : null)
      });
    });
  });
}

async function detectJavaCandidates(force = false) {
  if (!force && javaCache && Date.now() - javaCacheAt < 120000) return javaCache;
  if (javaInflight) return javaInflight;

  javaInflight = (async () => {
    const candidates = candidateJavaPaths();
    const inspected = await Promise.all(candidates.map((candidate) => inspectJavaPath(candidate)));
    const unique = new Map();
    for (const info of inspected) {
      if (!info) continue;
      const key = info.path.toLowerCase();
      if (!unique.has(key)) unique.set(key, info);
    }
    const list = [...unique.values()].sort((a, b) => b.major - a.major || b.version.localeCompare(a.version, undefined, { numeric: true }));
    javaCache = list;
    javaCacheAt = Date.now();
    broadcastJava();
    return list;
  })().finally(() => { javaInflight = null; });

  return javaInflight;
}

function javaMajorFromVersionJson(version, depth = 0) {
  if (depth > 3) return null;
  const id = safeVersionId(version);
  if (!id) return null;
  let metadata;
  try {
    const jsonPath = path.join(gamePaths().versions, id, `${id}.json`);
    metadata = JSON.parse(fs.readFileSync(jsonPath, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
  if (!isPlainObject(metadata)) return null;
  const major = Number(metadata.javaVersion?.majorVersion);
  if (Number.isInteger(major) && major >= 8 && major <= 99) return major;
  if (typeof metadata.inheritsFrom === 'string') return javaMajorFromVersionJson(metadata.inheritsFrom, depth + 1);
  return null;
}

function mappedJavaFor(version) {
  const value = String(version || '');
  const legacy = /^1\.(\d+)(?:\.(\d+))?/.exec(value);
  if (legacy) {
    const minor = Number(legacy[1]);
    const patch = Number(legacy[2] || 0);
    if (minor < 17) return 8;
    if (minor === 17) return 17;
    if (minor < 20 || (minor === 20 && patch < 5)) return 17;
    return 21;
  }
  // Versionado por año (por ejemplo 26.3): Minecraft usa Java 25.
  if (/^\d{2,}\.\d+/.test(value)) return 25;
  return 21;
}

function requiredJavaFor(version) {
  return javaMajorFromVersionJson(version) || mappedJavaFor(version);
}

function javaRequirementError(version, required, detected, message) {
  const error = new Error(message);
  error.code = 'JAVA_REQUIRED';
  error.details = {
    version: String(version || ''),
    required,
    detected: detected.map((info) => ({
      major: info.major,
      version: info.version,
      vendor: info.vendor,
      path: info.path
    }))
  };
  return error;
}

async function resolveJavaFor(version, options = {}) {
  const required = requiredJavaFor(version);
  const isCompatible = (info) => Boolean(info) && (required <= 8 ? info.major === 8 : info.major >= required);
  let detected = javaCache || [];
  if (!detected.length) detected = await detectJavaCandidates();

  const overridePath = typeof options.javaPath === 'string' ? options.javaPath.trim() : '';
  if (overridePath) {
    const info = await inspectJavaPath(overridePath);
    if (isCompatible(info)) return { path: info.path, info, required, automatic: false, instance: true };
    if (info) {
      throw javaRequirementError(
        version,
        required,
        detected,
        required <= 8
          ? `Esta instancia usa Java ${info.major}, pero Minecraft ${version} necesita Java 8 exactamente.`
          : `Esta instancia usa Java ${info.major}, pero Minecraft ${version} necesita Java ${required} o superior.`
      );
    }
    throw javaRequirementError(
      version,
      required,
      detected,
      `El Java configurado para esta instancia no existe o no es válido (${overridePath}).`
    );
  }

  // La instancia puede forzar la elección automática con una ruta vacía explícita.
  const explicitAutomatic = options.javaOverride === true && !overridePath;
  if (!explicitAutomatic) {
    const saved = settings.javaPaths?.[String(required)];
    if (saved) {
      const info = await inspectJavaPath(saved);
      if (isCompatible(info)) return { path: info.path, info, required, automatic: false };
    }

    if (settings.javaPath) {
      const info = await inspectJavaPath(settings.javaPath);
      if (isCompatible(info)) return { path: info.path, info, required, automatic: false };
      if (info) {
        throw javaRequirementError(
          version,
          required,
          detected,
          required <= 8
            ? `Minecraft ${version} necesita Java 8 exactamente, pero el Java elegido es ${info.major} (${info.vendor}).`
            : `Minecraft ${version} necesita Java ${required} o superior, pero el Java elegido es ${info.major} (${info.vendor}).`
        );
      }
    }
  }

  const sorted = detected
    .slice()
    .sort((a, b) => a.major - b.major || a.version.localeCompare(b.version, undefined, { numeric: true }));

  const exact = sorted.find((info) => info.major === required);
  if (exact) return { path: exact.path, info: exact, required, automatic: true };

  // Las versiones antiguas exigen Java 8 exactamente: una versión superior las rompe.
  const higher = required > 8 ? sorted.find((info) => info.major > required) : null;
  if (higher) return { path: higher.path, info: higher, required, automatic: true };

  if (!sorted.length) {
    throw javaRequirementError(
      version,
      required,
      detected,
      `No se encontró Java instalado. Minecraft ${version} necesita Java ${required}.`
    );
  }

  const available = [...new Set(sorted.map((info) => info.major))].join(', ');
  throw javaRequirementError(
    version,
    required,
    detected,
    required <= 8
      ? `Minecraft ${version} necesita Java 8 exactamente. Solo se detectó Java ${available}.`
      : `Minecraft ${version} necesita Java ${required} o superior. Solo se detectó Java ${available}.`
  );
}

function extractZipArchive(archive, destination) {
  return new Promise((resolve, reject) => {
    const quote = (value) => `'${String(value).replace(/'/g, "''")}'`;
    const isWindows = process.platform === 'win32';
    // Use the absolute path: a stripped PATH must not break extraction.
    const powershell = process.env.SystemRoot
      ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
      : 'powershell.exe';
    const command = isWindows ? powershell : 'unzip';
    const args = isWindows
      ? ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath ${quote(archive)} -DestinationPath ${quote(destination)} -Force`]
      : ['-q', '-o', archive, '-d', destination];

    execFile(command, args, { timeout: 600000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const detail = String(stderr || stdout || error.message || '').trim().slice(0, 200);
        reject(new Error(`No se pudo extraer el archivo descargado.${detail ? ` ${detail}` : ''}`));
        return;
      }
      resolve();
    });
  });
}

function adoptiumDownloadUrl(major) {
  const platform = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux';
  const arch = process.arch === 'arm64' ? 'aarch64' : process.arch === 'ia32' ? 'x86' : 'x64';
  // Minecraft solo necesita el entorno de ejecución: el JRE pesa mucho menos que el JDK.
  return `https://api.adoptium.net/v3/binary/latest/${major}/ga/${platform}/${arch}/jre/hotspot/normal/eclipse?project=jdk`;
}

async function installJavaInto(major, destination, onProgress = () => {}) {
  const required = Number(major);
  const archive = path.join(app.getPath('temp'), `nexylauncher-jdk-${required}-${Date.now()}.zip`);

  try {
    onProgress({ phase: 'download', percent: 0 });
    await downloadFile(adoptiumDownloadUrl(required), archive, {
      allowedDomains: ['adoptium.net'],
      maxBytes: 600 * 1024 * 1024,
      onProgress: (progress) => onProgress({ phase: 'download', percent: progress.percent })
    });

    onProgress({ phase: 'extract', percent: null });
    ensureDir(destination);
    await extractZipArchive(archive, destination);

    const found = new Set();
    collectJavaPathsFrom(destination, 4, found, { visited: 0 });
    const infos = (await Promise.all([...found].map((candidate) => inspectJavaPath(candidate)))).filter(Boolean);
    const chosen = infos
      .filter((info) => info.major >= required)
      .sort((a, b) => a.major - b.major || a.version.localeCompare(b.version, undefined, { numeric: true }))[0];

    if (!chosen) throw new Error(`Se extrajo Java, pero no se encontró un ejecutable compatible con Java ${required}.`);

    settings.javaPaths[String(required)] = chosen.path;
    saveSettings();
    if (javaCache && !javaCache.some((item) => item.path.toLowerCase() === chosen.path.toLowerCase())) {
      javaCache = [chosen, ...javaCache].sort((a, b) => b.major - a.major || b.version.localeCompare(a.version));
      broadcastJava();
    }

    onProgress({ phase: 'done', percent: 100 });
    return chosen;
  } finally {
    fs.promises.rm(archive, { force: true }).catch(() => {});
  }
}

/* -------------------------------------------------------------------------- */
/*                         Versiones, mods y servidores                       */
/* -------------------------------------------------------------------------- */

async function listLocalVersions() {
  const { versions } = gamePaths();
  let entries;
  try {
    entries = await fs.promises.readdir(versions, { withFileTypes: true });
  } catch {
    return [];
  }

  const result = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const id = entry.name;
    if (!VERSION_RE.test(id)) continue;
    const jsonPath = path.join(versions, id, `${id}.json`);
    if (!fs.existsSync(jsonPath)) continue;

    let metadata = {};
    try {
      metadata = JSON.parse(await fs.promises.readFile(jsonPath, 'utf8'));
    } catch {
      metadata = {};
    }

    const jarPath = path.join(versions, id, `${id}.jar`);
    let modified = null;
    try {
      modified = (await fs.promises.stat(path.join(versions, id))).mtime.toISOString();
    } catch {
      modified = null;
    }

    const type = typeof metadata.type === 'string' ? metadata.type : 'custom';
    const loaderInfo = versionLoaderInfo(id, metadata);
    let complete = fs.existsSync(jarPath);
    if (!complete && metadata.inheritsFrom) {
      const inherited = loadVersionChain(id);
      complete = !inherited.error && Boolean(findVersionJar(inherited.chain));
    }
    result.push({
      id,
      type,
      loader: loaderInfo.label,
      loaderId: loaderInfo.id,
      loaderVersion: loaderInfo.version,
      base: loaderInfo.base,
      javaMajor: javaMajorFromVersionJson(id),
      releaseTime: typeof metadata.releaseTime === 'string' ? metadata.releaseTime : modified,
      modified,
      complete,
      custom: type !== 'release' && type !== 'snapshot'
    });
  }

  return result.sort((a, b) => String(b.releaseTime || b.modified || '').localeCompare(String(a.releaseTime || a.modified || '')));
}

async function readLocalVersion(id) {
  const safe = safeVersionId(id);
  if (!safe) return null;
  const jsonPath = path.join(gamePaths().versions, safe, `${safe}.json`);
  try {
    const data = JSON.parse((await fs.promises.readFile(jsonPath, 'utf8')).replace(/^\uFEFF/, ''));
    if (!isPlainObject(data)) return null;
    return {
      id: safe,
      type: typeof data.type === 'string' ? data.type : 'release',
      inheritsFrom: typeof data.inheritsFrom === 'string' ? data.inheritsFrom : null,
      mainClass: typeof data.mainClass === 'string' ? data.mainClass : ''
    };
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*                     Versiones heredadas (Forge, Fabric…)                   */
/* -------------------------------------------------------------------------- */

const MAX_VERSION_DEPTH = 8;

function readVersionFile(versionsDirectory, id) {
  const safe = safeVersionId(id);
  if (!safe) return null;
  const file = path.join(versionsDirectory, safe, `${safe}.json`);
  try {
    const content = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
    const json = JSON.parse(content);
    return isPlainObject(json) ? { id: safe, file, json } : null;
  } catch {
    return null;
  }
}

function libraryFullKey(library) {
  const name = String(library?.name || '').trim();
  return name || '';
}

function libraryOverrideKey(library) {
  const parts = String(library?.name || '').split(':');
  if (parts.length < 2) return '';
  const classifier = parts.length > 3 ? parts[3] : '';
  return classifier ? `${parts[0]}:${parts[1]}:${classifier}` : `${parts[0]}:${parts[1]}`;
}

function mergeLibraries(parentLibraries, childLibraries) {
  const merged = new Map();
  const order = [];

  for (const library of Array.isArray(parentLibraries) ? parentLibraries : []) {
    if (!isPlainObject(library)) continue;
    const key = libraryFullKey(library);
    if (!key) continue;
    if (!merged.has(key)) order.push(key);
    merged.set(key, library);
  }

  const childEntries = (Array.isArray(childLibraries) ? childLibraries : []).filter(isPlainObject);
  const overridden = new Set(childEntries.map(libraryOverrideKey).filter(Boolean));
  if (overridden.size) {
    for (const key of [...order]) {
      const library = merged.get(key);
      if (!library || !overridden.has(libraryOverrideKey(library))) continue;
      merged.delete(key);
      order.splice(order.indexOf(key), 1);
    }
  }

  for (const library of childEntries) {
    const key = libraryFullKey(library);
    if (!key) continue;
    if (!merged.has(key)) order.push(key);
    merged.set(key, library);
  }

  return order.map((key) => merged.get(key));
}

function nativeClassifierMatchesPlatform(classifier) {
  const parts = String(classifier).split('-');
  if (parts[0] !== 'natives') return true;
  const target = parts[1];
  const platform = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux';
  if (target !== platform) return false;
  const arch = parts[2] || 'x64';
  const current = process.arch === 'x64' ? 'x64' : process.arch === 'ia32' ? 'x86' : process.arch;
  return arch === current;
}

function currentRuleOs() {
  return process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'osx' : 'linux';
}

function currentRuleArch() {
  return process.arch === 'ia32' ? 'x86' : process.arch;
}

function libraryRuleApplies(rule) {
  if (!isPlainObject(rule)) return false;
  const os = isPlainObject(rule.os) ? rule.os : null;
  if (os) {
    if (os.name && os.name !== currentRuleOs()) return false;
    if (os.arch && os.arch !== currentRuleArch()) return false;
  }
  const features = isPlainObject(rule.features) ? rule.features : null;
  if (features) {
    for (const [key, value] of Object.entries(features)) {
      if (key === 'is_demo_user') {
        if (value) return false;
        continue;
      }
      if (value) return false;
    }
  }
  return true;
}

function libraryRulesAllow(library) {
  const rules = Array.isArray(library?.rules) ? library.rules : null;
  if (!rules || !rules.length) return true;
  let allowed = false;
  for (const rule of rules) {
    if (!libraryRuleApplies(rule)) continue;
    allowed = rule.action !== 'disallow';
  }
  return allowed;
}

function filterNativeLibraries(libraries) {
  return (Array.isArray(libraries) ? libraries : []).filter((library) => {
    if (!isPlainObject(library)) return false;
    if (!libraryRulesAllow(library)) return false;
    const parts = String(library.name || '').split(':');
    if (parts.length < 4) return true;
    return nativeClassifierMatchesPlatform(parts[3]);
  });
}

const MAVEN_LIBRARY_HOSTS = new Set([
  'maven.fabricmc.net',
  'maven.quiltmc.org',
  'maven.minecraftforge.net',
  'maven.neoforged.net',
  'libraries.minecraft.net',
  'repo.maven.apache.org',
  'repo1.maven.org'
]);

function normalizeMavenLibrary(library) {
  if (!isPlainObject(library)) return library;
  if (library.downloads?.artifact?.path) return library;
  if (typeof library.url !== 'string' || typeof library.name !== 'string') return library;

  let base;
  try {
    base = new URL(library.url);
  } catch {
    return library;
  }
  if (base.protocol !== 'https:' || !MAVEN_LIBRARY_HOSTS.has(base.hostname)) return library;

  const [coordinates, extension = 'jar'] = library.name.trim().split('@');
  const parts = coordinates.split(':');
  if (parts.length < 3) return library;
  const [group, artifact, version, classifier] = parts;
  if (!group || !artifact || !version) return library;

  const fileName = `${artifact}-${version}${classifier ? `-${classifier}` : ''}.${extension || 'jar'}`;
  const relativePath = `${group.replace(/\./g, '/')}/${artifact}/${version}/${fileName}`;
  const baseHref = base.href.endsWith('/') ? base.href : `${base.href}/`;

  return {
    ...library,
    downloads: {
      ...(isPlainObject(library.downloads) ? library.downloads : {}),
      artifact: {
        path: relativePath,
        url: new URL(relativePath, baseHref).toString(),
        ...(typeof library.sha1 === 'string' && /^[a-f0-9]{40}$/i.test(library.sha1) ? { sha1: library.sha1.toLowerCase() } : {}),
        ...(Number.isFinite(Number(library.size)) && Number(library.size) > 0 ? { size: Number(library.size) } : {})
      }
    }
  };
}

function normalizeMavenLibraries(libraries) {
  return (Array.isArray(libraries) ? libraries : []).map(normalizeMavenLibrary);
}

const MAVEN_MIRRORS = {
  'maven.fabricmc.net': [
    'https://artifactory.papermc.io/artifactory/universe/',
    'https://us-west-01.mc-mirror.com/fabric/maven/'
  ]
};

function mavenArtifactCandidates(library) {
  const artifact = library?.downloads?.artifact;
  if (!artifact?.path || typeof artifact.url !== 'string') return [];

  let host;
  try {
    host = new URL(artifact.url).hostname;
  } catch {
    return [];
  }

  const urls = [];
  if (host === 'maven.fabricmc.net') {
    if (artifact.path.startsWith('org/ow2/asm/')) {
      urls.push(`https://repo1.maven.org/maven2/${artifact.path}`);
    }
    for (const mirror of MAVEN_MIRRORS[host]) urls.push(`${mirror}${artifact.path}`);
  }
  urls.push(artifact.url);
  return [...new Set(urls)];
}

async function fetchMavenSha1(url, signal) {
  try {
    const text = await fetchText(`${url}.sha1`, { timeout: 15000, signal });
    const match = /([a-f0-9]{40})/i.exec(text);
    return match ? match[1].toLowerCase() : null;
  } catch (error) {
    if (signal?.aborted) throw abortError();
    return null;
  }
}

async function ensureLaunchLibraries(libraries, gameRoot, signal) {
  const libraryRoot = path.join(gameRoot, 'libraries');
  const pending = (Array.isArray(libraries) ? libraries : []).filter(
    (library) => isPlainObject(library) && library.url && library.downloads?.artifact?.path && library.downloads?.artifact?.url
  );

  let checked = 0;
  for (const library of pending) {
    if (signal?.aborted) throw abortError();
    const destination = path.join(libraryRoot, library.downloads.artifact.path);

    try {
      const stat = await fs.promises.stat(destination);
      if (stat.size > 0) {
        checked++;
        continue;
      }
    } catch {
      /* falta la librería */
    }

    let lastError = null;
    let downloaded = false;
    for (const url of mavenArtifactCandidates(library)) {
      try {
        const expectedSha1 = library.downloads.artifact.sha1 || (await fetchMavenSha1(url, signal));
        await downloadFile(url, destination, {
          signal,
          ...(expectedSha1 ? { sha1: expectedSha1 } : {}),
          maxBytes: 128 * 1024 * 1024
        });
        downloaded = true;
        break;
      } catch (error) {
        if (signal?.aborted || error.name === 'AbortError') throw abortError();
        lastError = error;
      }
    }

    if (!downloaded) {
      const detail = lastError ? humanError(lastError) : 'No hay una dirección de descarga disponible.';
      throw new Error(`No se pudo descargar la librería "${library.name}" del cargador. ${detail}`);
    }
    checked++;
  }

  return checked;
}

function splitArgumentString(value) {
  const tokens = [];
  if (typeof value !== 'string') return tokens;
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match;
  while ((match = pattern.exec(value))) tokens.push(match[1] ?? match[2] ?? match[3]);
  return tokens;
}

function mergeLegacyArguments(parentValue, childValue) {
  const merged = splitArgumentString(parentValue);
  const child = splitArgumentString(childValue);
  for (let index = 0; index < child.length; index++) {
    const token = child[index];
    if (typeof token !== 'string' || !token.startsWith('--')) continue;
    const next = child[index + 1];
    const hasValue = next !== undefined && !String(next).startsWith('--');
    const existing = merged.indexOf(token);
    if (existing === -1) {
      merged.push(token);
      if (hasValue) {
        merged.push(next);
        index++;
      }
    } else if (hasValue) {
      const current = merged[existing + 1];
      if (current !== undefined && !String(current).startsWith('--')) {
        merged[existing + 1] = next;
      } else {
        merged.splice(existing + 1, 0, next);
      }
      index++;
    }
  }
  return merged.join(' ');
}

function mergeGameArguments(parentArgs, childArgs) {
  const result = [];
  const values = [
    ...(Array.isArray(parentArgs) ? parentArgs : []),
    ...(Array.isArray(childArgs) ? childArgs : [])
  ];
  for (const value of values) {
    if (typeof value === 'string' || isPlainObject(value)) result.push(value);
  }
  return result;
}

function ruleAllows(rules) {
  if (!Array.isArray(rules) || !rules.length) return true;
  const osName = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'osx' : 'linux';
  const osArch = process.arch === 'x64' ? 'x86_64' : process.arch;
  let allowed = false;
  for (const rule of rules) {
    if (!isPlainObject(rule)) continue;
    const os = isPlainObject(rule.os) ? rule.os : {};
    const matchesOs = !os.name || os.name === osName;
    const matchesArch = !os.arch || os.arch === osArch || (os.arch === 'x86' && process.arch === 'ia32');
    if (!matchesOs || !matchesArch) continue;
    if (rule.action === 'disallow') return false;
    if (rule.action === 'allow') allowed = true;
  }
  return allowed || !rules.some((rule) => rule?.action === 'allow');
}

function expandJvmArguments(entries, context) {
  const result = [];
  const replace = (value) => String(value)
    .replace(/\$\{library_directory\}/g, context.libraryDirectory)
    .replace(/\$\{classpath_separator\}/g, context.classpathSeparator)
    .replace(/\$\{version_name\}/g, context.versionName)
    .replace(/\$\{game_directory\}/g, context.gameDirectory)
    .replace(/\$\{assets_root\}/g, context.assetsRoot)
    .replace(/\$\{natives_directory\}/g, context.nativesDirectory)
    .replace(/\$\{launcher_name\}/g, 'NexyLauncher')
    .replace(/\$\{launcher_version\}/g, app.getVersion());
  const push = (value) => {
    if (typeof value === 'string' && value.trim()) result.push(replace(value));
  };
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (typeof entry === 'string') {
      push(entry);
      continue;
    }
    if (!isPlainObject(entry)) continue;
    if (entry.rules && !ruleAllows(entry.rules)) continue;
    if (Array.isArray(entry.value)) entry.value.forEach(push);
    else push(entry.value);
  }
  return result;
}

function loadVersionChain(id, gameRoot = null) {
  const { versions } = gamePaths(gameRoot);
  const chain = [];
  const seen = new Set();
  let current = id;
  while (current) {
    const safe = safeVersionId(current);
    if (!safe) return { chain, error: `La versión "${current}" no es válida.` };
    if (chain.length >= MAX_VERSION_DEPTH) {
      return { chain, error: 'La cadena de versiones heredadas es demasiado larga.' };
    }
    if (seen.has(safe)) {
      return { chain, error: 'La cadena de versiones heredadas contiene un ciclo.' };
    }
    const loaded = readVersionFile(versions, safe);
    if (!loaded) {
      return { chain, error: `Falta la versión base "${safe}" necesaria para iniciar "${id}". Instálala primero.` };
    }
    seen.add(safe);
    chain.unshift(loaded);
    current = typeof loaded.json.inheritsFrom === 'string' ? loaded.json.inheritsFrom.trim() : '';
  }
  return { chain, error: null };
}

function detectLoader(id, metadata) {
  const text = `${id} ${metadata?.inheritsFrom || ''} ${metadata?.mainClass || ''}`.toLowerCase();
  if (text.includes('neoforge')) return 'NeoForge';
  if (text.includes('forge')) return 'Forge';
  if (text.includes('fabric')) return 'Fabric';
  if (text.includes('quilt')) return 'Quilt';
  return typeof metadata?.inheritsFrom === 'string' && metadata.inheritsFrom.trim() ? 'Modded' : null;
}

function mergeVersionChain(chain) {
  const root = chain[0];
  const merged = JSON.parse(JSON.stringify(root.json));
  const rawJvmArgs = [];

  for (const entry of chain.slice(1)) {
    const child = entry.json;
    const inheritedFields = [
      'mainClass',
      'type',
      'assets',
      'assetIndex',
      'downloads',
      'javaVersion',
      'logging',
      'releaseTime',
      'time',
      'minimumLauncherVersion',
      'complianceLevel'
    ];
    for (const key of inheritedFields) {
      if (child[key] !== undefined) merged[key] = JSON.parse(JSON.stringify(child[key]));
    }

    merged.libraries = mergeLibraries(merged.libraries, child.libraries);
    if (Array.isArray(child.arguments?.jvm)) rawJvmArgs.push(...child.arguments.jvm);

    const parentGame = Array.isArray(merged.arguments?.game)
      ? merged.arguments.game
      : merged.minecraftArguments
        ? splitArgumentString(merged.minecraftArguments)
        : [];
    const childGame = Array.isArray(child.arguments?.game)
      ? child.arguments.game
      : child.minecraftArguments
        ? splitArgumentString(child.minecraftArguments)
        : [];

    if (merged.arguments || child.arguments) {
      merged.arguments = {
        ...(isPlainObject(merged.arguments) ? merged.arguments : {}),
        ...(isPlainObject(child.arguments) ? child.arguments : {}),
        game: mergeGameArguments(parentGame, childGame),
        jvm: []
      };
      delete merged.minecraftArguments;
    } else if (child.minecraftArguments) {
      merged.minecraftArguments = mergeLegacyArguments(merged.minecraftArguments || '', child.minecraftArguments);
    }

    if (child.jar !== undefined) merged.jar = child.jar;
  }

  merged.id = chain[chain.length - 1].id;
  merged.libraries = normalizeMavenLibraries(filterNativeLibraries(merged.libraries));
  delete merged.inheritsFrom;
  return { merged, rawJvmArgs };
}

function findVersionJar(chain, gameRoot = null) {
  const { versions } = gamePaths(gameRoot);
  for (let index = chain.length - 1; index >= 0; index--) {
    const candidate = path.join(versions, chain[index].id, `${chain[index].id}.jar`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function prepareLaunchVersion(id) {
  const { gameRoot } = gamePaths();
  const { chain, error } = loadVersionChain(id);
  if (error) throw new Error(error);
  if (chain.length <= 1) {
    return { modded: false, versionJson: null, minecraftJar: null, extraJvmArgs: [], loader: null, base: null };
  }

  const { merged, rawJvmArgs } = mergeVersionChain(chain);
  const leaf = chain[chain.length - 1];
  const base = chain[chain.length - 2];
  const loaderInfo = versionLoaderInfo(leaf.id, leaf.json);
  const loader = loaderInfo.label;
  const cacheDirectory = path.join(DATA_DIR, 'cache', 'launch');
  ensureDir(cacheDirectory);
  const rootKey = crypto.createHash('sha1').update(gameRoot).digest('hex').slice(0, 10);
  const cacheFile = path.join(cacheDirectory, `${leaf.id}-${rootKey}.json`);
  fs.writeFileSync(cacheFile, JSON.stringify(merged, null, 2), 'utf8');

  const minecraftJar = findVersionJar(chain);
  if (!minecraftJar) {
    throw new Error(`No se encontró el archivo .jar de Minecraft para "${leaf.id}". Vuelve a instalar la versión base "${base.id}".`);
  }

  const baseMatch = /^1\.(\d+)/.exec(base.id);
  const modernNatives = baseMatch ? Number(baseMatch[1]) >= 19 : false;
  const extraJvmArgs = expandJvmArguments(rawJvmArgs, {
    libraryDirectory: path.join(gameRoot, 'libraries'),
    classpathSeparator: path.delimiter,
    versionName: leaf.id,
    gameDirectory: gameRoot,
    assetsRoot: path.join(gameRoot, 'assets'),
    nativesDirectory: modernNatives ? gameRoot : path.join(gameRoot, 'natives', leaf.id)
  });

  return {
    modded: true,
    versionJson: cacheFile,
    minecraftJar,
    extraJvmArgs,
    loader,
    loaderId: loaderInfo.id,
    loaderVersion: loaderInfo.version,
    base: base.id,
    libraries: merged.libraries
  };
}

async function fetchManifest(force = false) {
  const cached = readJson(FILES.manifest, null);
  const cacheAge = cached?.fetchedAt ? Date.now() - cached.fetchedAt : Infinity;
  const usableCache = isPlainObject(cached) && isPlainObject(cached.data) && Array.isArray(cached.data.versions);

  if (!force && usableCache && cacheAge < 6 * 60 * 60 * 1000) {
    return { ...cached.data, fetchedAt: cached.fetchedAt, stale: false };
  }

  try {
    const response = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json', {
      headers: { 'User-Agent': 'NexyLauncher/1.0 (Electron)', Accept: 'application/json' },
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) throw new Error(`Mojang respondió HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.versions)) throw new Error('Respuesta de versiones inválida.');
    const fetchedAt = Date.now();
    writeJson(FILES.manifest, { fetchedAt, data: { latest: data.latest, versions: data.versions } });
    return { latest: data.latest, versions: data.versions, fetchedAt, stale: false };
  } catch (error) {
    if (usableCache) {
      return { ...cached.data, fetchedAt: cached.fetchedAt, stale: true, error: humanError(error) };
    }
    throw new Error(`No se pudo obtener la lista de versiones. Revisa tu conexión a internet. (${humanError(error)})`);
  }
}

/* -------------------------------------------------------------------------- */
/*                     Cargadores de mods e instalación                       */
/* -------------------------------------------------------------------------- */

function compareVersionsDesc(a, b) {
  return String(b).localeCompare(String(a), undefined, { numeric: true, sensitivity: 'base' });
}

function parseMavenVersions(xml) {
  return [...String(xml || '').matchAll(/<version>([^<]+)<\/version>/g)]
    .map((match) => match[1].trim())
    .filter((value) => safeVersionId(value));
}

function markLoaderVersions(list, loader, mcVersion, gameRoot = null) {
  const versions = list
    .filter((item) => item && safeVersionId(item.version))
    .map((item) => {
      const id = loaderVersionId(loader, mcVersion, item.version);
      return {
        version: item.version,
        id,
        stable: item.stable !== false,
        recommended: item.recommended === true,
        latest: item.latest === true,
        installed: id ? versionInstalled(id, gameRoot) : false
      };
    });
  return versions;
}

function chooseDefaultLoaderVersion(versions) {
  if (!Array.isArray(versions) || !versions.length) return null;
  const recommended = versions.find((item) => item.recommended);
  if (recommended) return recommended.version;
  const latest = versions.find((item) => item.latest);
  if (latest) return latest.version;
  const stable = versions.find((item) => item.stable);
  return (stable || versions[0]).version;
}

async function fetchFabricLoaderVersions(loader, mcVersion, options) {
  const base = loader === 'quilt' ? 'https://meta.quiltmc.org/v3' : 'https://meta.fabricmc.net/v2';
  const url = `${base}/versions/loader/${encodeURIComponent(mcVersion)}`;
  const data = loader === 'fabric'
    ? await fetchFabricJson(url, { signal: options.signal, timeout: 20000 })
    : await fetchJson(url, { signal: options.signal, timeout: 20000 });
  if (!Array.isArray(data)) throw new Error('La lista de versiones del cargador no es válida.');

  const versions = data
    .map((item) => {
      const version = safeVersionId(item?.loader?.version);
      if (!version) return null;
      const beta = /(?:^|[-.])?(beta|alpha|rc)/i.test(version);
      return { version, stable: item?.loader?.stable !== false && !beta };
    })
    .filter(Boolean)
    .sort((a, b) => compareVersionsDesc(a.version, b.version))
    .slice(0, 80);

  if (!versions.length) {
    throw new Error(`${LOADER_LABELS[loader]} no tiene versiones compatibles con Minecraft ${mcVersion}.`);
  }
  return versions;
}

async function fetchForgeLoaderVersions(mcVersion, options) {
  const xml = await fetchText('https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml', {
    signal: options.signal,
    timeout: 30000
  });
  const promotions = await fetchJson('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json', {
    signal: options.signal,
    timeout: 20000
  }).catch(() => null);

  const prefix = `${mcVersion}-`;
  const versions = [...new Set(parseMavenVersions(xml)
    .filter((value) => value.startsWith(prefix))
    .map((value) => value.slice(prefix.length)))]
    .sort(compareVersionsDesc)
    .slice(0, 80)
    .map((version) => ({
      version,
      stable: true,
      recommended: promotions?.promos?.[`${mcVersion}-recommended`] === version,
      latest: promotions?.promos?.[`${mcVersion}-latest`] === version
    }));

  if (!versions.length) {
    throw new Error(`Forge no tiene versiones compatibles con Minecraft ${mcVersion}. Prueba otra versión del juego.`);
  }
  return versions;
}

async function fetchNeoForgeLoaderVersions(mcVersion, options) {
  let xmlUrl;
  let prefix;

  if (mcVersion === '1.20.1') {
    xmlUrl = 'https://maven.neoforged.net/releases/net/neoforged/forge/maven-metadata.xml';
    prefix = '1.20.1-';
  } else {
    xmlUrl = 'https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml';
    if (mcVersion.startsWith('1.')) {
      const parts = mcVersion.split('.');
      prefix = `${parts[1]}.${parts[2] || '0'}.`;
    } else {
      prefix = `${mcVersion}.`;
    }
  }

  const xml = await fetchText(xmlUrl, { signal: options.signal, timeout: 30000 });
  const versions = [...new Set(parseMavenVersions(xml)
    .filter((value) => value.startsWith(prefix))
    .map((value) => (mcVersion === '1.20.1' ? value.slice(prefix.length) : value)))]
    .sort(compareVersionsDesc)
    .slice(0, 80)
    .map((version) => ({
      version,
      stable: !/(?:^|[-.])?(beta|alpha|rc)/i.test(version),
      recommended: false,
      latest: false
    }));

  if (!versions.length) {
    throw new Error(`NeoForge no tiene versiones compatibles con Minecraft ${mcVersion}. Prueba 1.20.1 o una versión más reciente.`);
  }
  return versions;
}

async function fetchLoaderVersions(loader, mcVersion, options = {}) {
  const key = normalizeLoader(loader);
  const mc = safeVersionId(mcVersion);
  if (!key) throw new Error('El cargador seleccionado no es válido.');
  if (!mc) throw new Error('La versión de Minecraft no es válida.');

  if (key === 'vanilla') {
    return { loader: key, label: LOADER_LABELS[key], mcVersion: mc, versions: [], defaultVersion: null, fetchedAt: Date.now() };
  }

  const cacheKey = `${key}:${mc}`;
  const cached = loaderVersionsCache.get(cacheKey);
  if (!options.force && cached && Date.now() - cached.fetchedAt < LOADER_CACHE_TTL) {
    return { ...cached.data, cached: true };
  }

  let raw;
  if (key === 'fabric' || key === 'quilt') raw = await fetchFabricLoaderVersions(key, mc, options);
  else if (key === 'forge') raw = await fetchForgeLoaderVersions(mc, options);
  else raw = await fetchNeoForgeLoaderVersions(mc, options);

  const versions = markLoaderVersions(raw, key, mc);
  const data = {
    loader: key,
    label: LOADER_LABELS[key],
    mcVersion: mc,
    versions,
    defaultVersion: chooseDefaultLoaderVersion(versions),
    fetchedAt: Date.now(),
    cached: false
  };

  loaderVersionsCache.set(cacheKey, { fetchedAt: data.fetchedAt, data });
  return data;
}

async function resolveLoaderVersion(loader, mcVersion, requestedVersion, options = {}) {
  const key = normalizeLoader(loader);
  const mc = safeVersionId(mcVersion);
  if (!key || key === 'vanilla') throw new Error('El cargador seleccionado no es válido.');
  if (!mc) throw new Error('La versión de Minecraft no es válida.');

  if (requestedVersion) {
    const requested = safeVersionId(requestedVersion);
    if (!requested) throw new Error('La versión del cargador no es válida.');
    const id = loaderVersionId(key, mc, requested);
    if (id && versionInstalled(id, options.gameRoot)) {
      return { version: requested, id, installed: true, stable: true, recommended: false, latest: false };
    }
    const data = await fetchLoaderVersions(key, mc, options);
    const match = data.versions.find((item) => item.version === requested);
    if (!match) {
      throw new Error(`${LOADER_LABELS[key]} ${requested} no está disponible para Minecraft ${mc}. Elige otra versión.`);
    }
    return match;
  }

  const data = await fetchLoaderVersions(key, mc, options);
  const chosen = data.versions.find((item) => item.version === data.defaultVersion) || data.versions[0];
  if (!chosen) throw new Error(`No se encontró una versión compatible de ${LOADER_LABELS[key]}.`);
  return chosen;
}

async function ensureBaseVersionInstalled(mcVersion, options = {}) {
  const mc = safeVersionId(mcVersion);
  if (!mc) throw new Error('La versión de Minecraft no es válida.');

  const notify = typeof options.notify === 'function' ? options.notify : () => {};
  const signal = options.signal;
  const directory = path.join(gamePaths(options.gameRoot).versions, mc);
  const jsonPath = path.join(directory, `${mc}.json`);
  const jarPath = path.join(directory, `${mc}.jar`);

  let metadata = null;
  if (fs.existsSync(jsonPath)) {
    try {
      metadata = JSON.parse((await fs.promises.readFile(jsonPath, 'utf8')).replace(/^\uFEFF/, ''));
    } catch {
      metadata = null;
    }
  }

  if (!metadata) {
    notify(`Buscando Minecraft ${mc} en el catálogo de Mojang…`);
    const manifest = await fetchManifest(false);
    const entry = manifest.versions.find((version) => version.id === mc);
    if (!entry || !entry.url) {
      throw new Error(`Minecraft ${mc} no aparece en el catálogo oficial. Comprueba el nombre de la versión.`);
    }
    notify(`Descargando el perfil de Minecraft ${mc}…`);
    const data = await fetchJson(entry.url, { signal: signal, timeout: 30000 });
    if (!data || data.id !== mc || !data.downloads) {
      throw new Error(`El perfil de Minecraft ${mc} recibido no es válido.`);
    }
    ensureDir(directory);
    writeJson(jsonPath, data);
    if (!fs.existsSync(jsonPath)) throw new Error(`No se pudo guardar el perfil de Minecraft ${mc}.`);
    metadata = data;
  }

  if (!fs.existsSync(jarPath) || fs.statSync(jarPath).size === 0) {
    const client = metadata.downloads?.client;
    if (!client?.url) {
      throw new Error(`Minecraft ${mc} no incluye un cliente descargable. Prueba con otra versión.`);
    }
    notify(`Descargando el cliente de Minecraft ${mc}…`, 0);
    await downloadFile(client.url, jarPath, {
      signal: signal,
      allowedDomains: ['mojang.com', 'minecraft.net'],
      maxBytes: 500 * 1024 * 1024,
      sha1: client.sha1,
      onProgress: (progress) => notify(`Descargando el cliente de Minecraft ${mc}…`, progress.percent)
    });
  }

  return { id: mc, jsonPath, jarPath, metadata };
}

function ensureLauncherProfiles(gameRoot) {
  const file = path.join(gameRoot, 'launcher_profiles.json');
  if (fs.existsSync(file)) return;
  ensureDir(gameRoot);
  writeJson(file, {
    profiles: {},
    settings: { enableSnapshots: false, keepLauncherOpen: false, showGameLog: false, showMenu: false },
    version: 3
  });
}

function runInstallerProcess(javaPath, installerPath, gameRoot, options = {}) {
  return new Promise((resolve, reject) => {
    const signal = options.signal;
    const output = [];
    let settled = false;
    let timedOut = false;
    let buffer = '';
    let lastOutputAt = 0;

    const child = spawn(javaPath, ['-jar', installerPath, '--installClient', gameRoot], {
      cwd: gameRoot,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    activeInstaller = child;

    const cleanup = () => {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', abort);
      if (activeInstaller === child) activeInstaller = null;
    };

    const finish = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve({ output });
    };

    const abort = () => {
      child.kill();
      finish(abortError());
    };

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
      finish(new Error('El instalador tardó demasiado. Comprueba tu conexión e inténtalo de nuevo.'));
    }, 15 * 60 * 1000);

    if (signal) {
      if (signal.aborted) {
        child.kill();
        finish(abortError());
        return;
      }
      signal.addEventListener('abort', abort, { once: true });
    }

    const consume = (chunk) => {
      buffer += String(chunk);
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        output.push(trimmed);
        if (output.length > 600) output.splice(0, output.length - 600);
        const now = Date.now();
        if (typeof options.onOutput === 'function' && now - lastOutputAt > 450) {
          lastOutputAt = now;
          options.onOutput(trimmed);
        }
      }
    };

    child.stdout?.on('data', consume);
    child.stderr?.on('data', consume);

    child.on('error', (error) => {
      finish(new Error(`No se pudo ejecutar el instalador: ${humanError(error)}`));
    });

    child.on('close', (code) => {
      if (settled) return;
      if (buffer.trim()) output.push(buffer.trim());
      if (timedOut) return finish(new Error('El instalador tardó demasiado.'));
      if (signal?.aborted) return finish(abortError());
      if (code !== 0) {
        const tail = output.slice(-14).join('\n');
        return finish(new Error(`El instalador terminó con errores (código ${code}).${tail ? `\n${tail}` : ''}`));
      }
      return finish(null);
    });
  });
}

function findInstalledLoaderVersion(mcVersion, expectedId, gameRoot = null) {
  if (expectedId && versionInstalled(expectedId, gameRoot)) return expectedId;

  const versionsDirectory = gamePaths(gameRoot).versions;
  let entries = [];
  try {
    entries = fs.readdirSync(versionsDirectory, { withFileTypes: true });
  } catch {
    return null;
  }

  let best = null;
  for (const entry of entries) {
    if (!entry.isDirectory() || !safeVersionId(entry.name)) continue;
    const loaded = readVersionFile(versionsDirectory, entry.name);
    if (!loaded) continue;
    const data = loaded.json;
    if (data.inheritsFrom !== mcVersion) continue;
    const text = `${entry.name} ${data.mainClass || ''}`.toLowerCase();
    if (!/forge|neoforge|fabric|quilt/.test(text)) continue;
    let modified = 0;
    try {
      modified = fs.statSync(path.join(versionsDirectory, entry.name)).mtimeMs;
    } catch {
      modified = 0;
    }
    if (!best || modified > best.modified) best = { id: entry.name, modified };
  }
  return best?.id || null;
}

async function installForgeLikeLoader(loader, mcVersion, loaderVersion, options = {}) {
  const notify = typeof options.notify === 'function' ? options.notify : () => {};
  const signal = options.signal;
  const gameRoot = options.gameRoot || null;
  const expectedId = loaderVersionId(loader, mcVersion, loaderVersion);
  if (!expectedId) throw new Error('La versión del cargador no es válida.');
  if (versionInstalled(expectedId, gameRoot)) {
    writeLoaderMarker(expectedId, loader, loaderVersion, mcVersion, gameRoot);
    return expectedId;
  }

  let artifactUrl;
  if (loader === 'neoforge') {
    artifactUrl = mcVersion === '1.20.1'
      ? `https://maven.neoforged.net/releases/net/neoforged/forge/${mcVersion}-${loaderVersion}/forge-${mcVersion}-${loaderVersion}-installer.jar`
      : `https://maven.neoforged.net/releases/net/neoforged/neoforge/${loaderVersion}/neoforge-${loaderVersion}-installer.jar`;
  } else {
    artifactUrl = `https://maven.minecraftforge.net/net/minecraftforge/forge/${mcVersion}-${loaderVersion}/forge-${mcVersion}-${loaderVersion}-installer.jar`;
  }

  const installerName = path.basename(new URL(artifactUrl).pathname);
  const installerPath = path.join(DATA_DIR, 'cache', 'installers', installerName);
  const cachedInstaller = fs.existsSync(installerPath) && fs.statSync(installerPath).size > 50 * 1024;

  if (!cachedInstaller) {
    notify(`Descargando el instalador de ${LOADER_LABELS[loader]}…`, 0);
    let sha1 = null;
    try {
      const hashResponse = await fetchText(`${artifactUrl}.sha1`, { signal: signal, timeout: 15000 });
      if (/^[a-f0-9]{40}$/i.test(hashResponse.trim())) sha1 = hashResponse.trim();
    } catch {
      sha1 = null;
    }
    await downloadFile(artifactUrl, installerPath, {
      signal: signal,
      allowedDomains: ['minecraftforge.net', 'neoforged.net'],
      maxBytes: 100 * 1024 * 1024,
      sha1: sha1 || undefined,
      onProgress: (progress) => notify(`Descargando el instalador de ${LOADER_LABELS[loader]}…`, progress.percent)
    });
  }

  const gameDirectory = gamePaths(gameRoot).gameRoot;
  ensureLauncherProfiles(gameDirectory);
  notify(`Ejecutando el instalador de ${LOADER_LABELS[loader]}… esto puede tardar unos minutos.`);

  const java = await resolveJavaFor(mcVersion, { javaPath: options.javaPath, javaOverride: options.javaOverride === true });
  let lastNotice = 0;
  await runInstallerProcess(java.path, installerPath, gameDirectory, {
    signal: signal,
    onOutput: (line) => {
      if (!currentLaunch) return;
      const important = /^(Downloading|Installing|Patching|Extracting|Injecting|Processing|Successfully|There was|Error|Exception|Failed|A problem|Warning|Target|Found java)/i.test(line);
      if (important || Date.now() - lastNotice > 2500) {
        lastNotice = Date.now();
        notify(line.slice(0, 160));
      }
      if (important) pushLog('debug', `[instalador] ${line}`);
    }
  });

  const installedId = findInstalledLoaderVersion(mcVersion, expectedId, gameRoot);
  if (!installedId) {
    throw new Error(`El instalador de ${LOADER_LABELS[loader]} terminó, pero no se encontró la versión creada. Revisa la consola o la carpeta versions.`);
  }

  writeLoaderMarker(installedId, loader, loaderVersion, mcVersion, gameRoot);
  notify(`${LOADER_LABELS[loader]} ${loaderVersion} se instaló correctamente.`);
  return installedId;
}

async function installFabricLikeLoader(loader, mcVersion, loaderVersion, options = {}) {
  const notify = typeof options.notify === 'function' ? options.notify : () => {};
  const signal = options.signal;
  const gameRoot = options.gameRoot || null;
  const expectedId = loaderVersionId(loader, mcVersion, loaderVersion);
  if (!expectedId) throw new Error('La versión del cargador no es válida.');
  if (versionInstalled(expectedId, gameRoot)) {
    writeLoaderMarker(expectedId, loader, loaderVersion, mcVersion, gameRoot);
    return expectedId;
  }

  const base = loader === 'quilt' ? 'https://meta.quiltmc.org/v3' : 'https://meta.fabricmc.net/v2';
  notify(`Descargando el perfil de ${LOADER_LABELS[loader]} ${loaderVersion}…`);
  const profileUrl = `${base}/versions/loader/${encodeURIComponent(mcVersion)}/${encodeURIComponent(loaderVersion)}/profile/json`;
  const profile = loader === 'fabric'
    ? await fetchFabricJson(profileUrl, { signal, timeout: 25000 })
    : await fetchJson(profileUrl, { signal, timeout: 25000 });

  if (!isPlainObject(profile) || profile.inheritsFrom !== mcVersion) {
    throw new Error(`El perfil de ${LOADER_LABELS[loader]} recibido no es válido para Minecraft ${mcVersion}.`);
  }

  const profileId = safeVersionId(profile.id);
  if (!profileId || profileId !== expectedId) {
    throw new Error(`El identificador del perfil de ${LOADER_LABELS[loader]} no es válido.`);
  }

  const directory = path.join(gamePaths(gameRoot).versions, profileId);
  ensureDir(directory);
  writeJson(path.join(directory, `${profileId}.json`), profile);
  if (!fs.existsSync(path.join(directory, `${profileId}.json`))) {
    throw new Error(`No se pudo guardar el perfil de ${LOADER_LABELS[loader]}.`);
  }
  writeLoaderMarker(profileId, loader, loaderVersion, mcVersion, gameRoot);
  notify(`${LOADER_LABELS[loader]} ${loaderVersion} se instaló correctamente.`);
  return profileId;
}

async function ensureLoaderInstalled(loader, mcVersion, requestedVersion, options = {}) {
  const key = normalizeLoader(loader);
  const mc = safeVersionId(mcVersion);
  if (!key || key === 'vanilla') throw new Error('El cargador seleccionado no es válido.');
  if (!mc) throw new Error('La versión de Minecraft no es válida.');

  const notify = typeof options.notify === 'function' ? options.notify : () => {};
  const resolved = await resolveLoaderVersion(key, mc, requestedVersion, options);
  if (resolved.id && versionInstalled(resolved.id, options.gameRoot)) {
    writeLoaderMarker(resolved.id, key, resolved.version, mc, options.gameRoot);
    return { id: resolved.id, version: resolved.version, loader: key, installed: true };
  }

  await ensureBaseVersionInstalled(mc, { signal: options.signal, notify, gameRoot: options.gameRoot });
  const id = key === 'fabric' || key === 'quilt'
    ? await installFabricLikeLoader(key, mc, resolved.version, options)
    : await installForgeLikeLoader(key, mc, resolved.version, options);

  return { id, version: resolved.version, loader: key, installed: false };
}

/* -------------------------------------------------------------------------- */
/*                       Modrinth y CurseForge (mods)                         */
/* -------------------------------------------------------------------------- */

function normalizeModLoader(value) {
  const key = String(value ?? '').trim().toLowerCase();
  return ['fabric', 'quilt', 'forge', 'neoforge'].includes(key) ? key : null;
}

function safeProjectId(value) {
  const id = String(value ?? '').trim();
  return PROJECT_ID_RE.test(id) ? id : null;
}

function truncateText(value, max = 500) {
  const text = String(value ?? '').replace(/\r/g, '').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function safeImageUrl(value) {
  try {
    const parsed = new URL(String(value));
    if (parsed.protocol !== 'https:') return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function mapModrinthVersion(version) {
  if (!isPlainObject(version)) return null;
  const id = safeProjectId(version.id);
  if (!id) return null;
  const files = (Array.isArray(version.files) ? version.files : [])
    .filter((file) => isPlainObject(file) && typeof file.url === 'string' && sanitizeModName(file.filename))
    .map((file) => ({
      filename: String(file.filename).slice(0, 180),
      url: file.url,
      size: Number(file.size) || 0,
      primary: file.primary === true,
      hashes: isPlainObject(file.hashes) ? {
        sha1: typeof file.hashes.sha1 === 'string' ? file.hashes.sha1 : null,
        sha512: typeof file.hashes.sha512 === 'string' ? file.hashes.sha512 : null
      } : {}
    }));

  return {
    id,
    projectId: safeProjectId(version.project_id),
    name: truncateText(version.name, 120),
    versionNumber: truncateText(version.version_number, 80),
    versionType: ['release', 'beta', 'alpha'].includes(version.version_type) ? version.version_type : 'release',
    loaders: Array.isArray(version.loaders) ? version.loaders.map(String).slice(0, 12) : [],
    gameVersions: Array.isArray(version.game_versions) ? version.game_versions.map(String).slice(0, 40) : [],
    datePublished: typeof version.date_published === 'string' ? version.date_published : null,
    downloads: Number(version.downloads) || 0,
    changelog: truncateText(version.changelog, 1200),
    files,
    dependencies: (Array.isArray(version.dependencies) ? version.dependencies : [])
      .filter((dependency) => isPlainObject(dependency))
      .map((dependency) => ({
        projectId: safeProjectId(dependency.project_id),
        versionId: safeProjectId(dependency.version_id),
        type: String(dependency.dependency_type || '')
      }))
      .slice(0, 30)
  };
}

async function modrinthSearch(payload = {}) {
  const query = truncateText(payload.query, 100);
  const gameVersion = payload.gameVersion ? safeVersionId(payload.gameVersion) : null;
  const loader = payload.loader ? normalizeModLoader(payload.loader) : null;
  const limit = Math.round(clamp(payload.limit ?? 20, 1, 30));
  const offset = Math.round(clamp(payload.offset ?? 0, 0, 500));

  if (payload.gameVersion && !gameVersion) throw new Error('La versión de Minecraft no es válida.');
  if (payload.loader && !loader) throw new Error('El cargador seleccionado no es válido.');

  const facets = [['project_type:mod']];
  if (gameVersion) facets.push([`versions:${gameVersion}`]);
  if (loader) facets.push([`categories:${loader}`]);

  const params = new URLSearchParams();
  params.set('query', query);
  params.set('facets', JSON.stringify(facets));
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  params.set('index', query ? 'relevance' : 'downloads');

  const data = await fetchJson(`${MODRINTH_API}/search?${params.toString()}`, { timeout: 20000 });
  const hits = (Array.isArray(data?.hits) ? data.hits : [])
    .filter((hit) => isPlainObject(hit) && safeProjectId(hit.project_id))
    .map((hit) => ({
      id: hit.project_id,
      slug: typeof hit.slug === 'string' ? hit.slug : '',
      title: truncateText(hit.title, 100),
      description: truncateText(hit.description, 220),
      author: truncateText(hit.author, 60),
      icon: safeImageUrl(hit.icon_url),
      downloads: Number(hit.downloads) || 0,
      follows: Number(hit.follows) || 0,
      categories: Array.isArray(hit.categories) ? hit.categories.map(String).slice(0, 8) : [],
      versions: Array.isArray(hit.versions) ? hit.versions.map(String).slice(0, 40) : [],
      provider: 'modrinth'
    }));

  return { provider: 'modrinth', hits, total: Number(data?.total) || hits.length, offset: Number(data?.offset) || offset, limit };
}

async function modrinthProject(payload = {}) {
  const projectId = safeProjectId(payload.projectId);
  if (!projectId) throw new Error('El mod seleccionado no es válido.');

  const data = await fetchJson(`${MODRINTH_API}/project/${encodeURIComponent(projectId)}`, { timeout: 20000 });
  if (!isPlainObject(data)) throw new Error('La información del mod no es válida.');

  const gallery = (Array.isArray(data.gallery) ? data.gallery : [])
    .filter((item) => isPlainObject(item) && (safeImageUrl(item.url) || safeImageUrl(item.raw_url)))
    .slice(0, 30)
    .map((item) => {
      const url = safeImageUrl(item.url) || safeImageUrl(item.raw_url);
      return {
        url,
        full: safeImageUrl(item.raw_url) || url,
        title: truncateText(item.title, 120),
        description: truncateText(item.description, 300),
        featured: item.featured === true
      };
    });

  return {
    provider: 'modrinth',
    project: {
      id: safeProjectId(data.id) || projectId,
      slug: typeof data.slug === 'string' ? data.slug.slice(0, 120) : '',
      title: truncateText(data.title, 100),
      description: truncateText(data.description, 300),
      body: String(data.body ?? '').replace(/\r\n?/g, '\n').slice(0, 40000),
      icon: safeImageUrl(data.icon_url),
      gallery,
      downloads: Number(data.downloads) || 0,
      followers: Number(data.followers) || 0,
      categories: Array.isArray(data.categories) ? data.categories.map(String).slice(0, 12) : [],
      loaders: Array.isArray(data.loaders) ? data.loaders.map(String).slice(0, 12) : [],
      gameVersions: Array.isArray(data.game_versions) ? data.game_versions.map(String).slice(0, 120) : [],
      published: typeof data.published === 'string' ? data.published : null,
      updated: typeof data.updated === 'string' ? data.updated : null,
      sourceUrl: safeImageUrl(data.source_url),
      issuesUrl: safeImageUrl(data.issues_url),
      wikiUrl: safeImageUrl(data.wiki_url),
      license: isPlainObject(data.license) ? {
        id: typeof data.license.id === 'string' ? data.license.id.slice(0, 40) : '',
        name: truncateText(data.license.name, 80),
        url: safeImageUrl(data.license.url)
      } : null
    }
  };
}

async function modrinthVersions(payload = {}) {
  const projectId = safeProjectId(payload.projectId);
  if (!projectId) throw new Error('El mod seleccionado no es válido.');
  const gameVersion = payload.gameVersion ? safeVersionId(payload.gameVersion) : null;
  const loader = payload.loader ? normalizeModLoader(payload.loader) : null;
  if (payload.gameVersion && !gameVersion) throw new Error('La versión de Minecraft no es válida.');
  if (payload.loader && !loader) throw new Error('El cargador seleccionado no es válido.');

  const params = new URLSearchParams();
  if (gameVersion) params.set('game_versions', JSON.stringify([gameVersion]));
  if (loader) params.set('loaders', JSON.stringify([loader]));
  const suffix = params.toString() ? `?${params.toString()}` : '';

  const data = await fetchJson(`${MODRINTH_API}/project/${encodeURIComponent(projectId)}/version${suffix}`, { timeout: 20000 });
  if (!Array.isArray(data)) throw new Error('La lista de versiones del mod no es válida.');
  const versions = data.map(mapModrinthVersion).filter(Boolean);
  return { provider: 'modrinth', projectId, versions };
}

async function fetchModrinthVersion(versionId) {
  const id = safeProjectId(versionId);
  if (!id) throw new Error('La versión del mod no es válida.');
  const data = await fetchJson(`${MODRINTH_API}/version/${encodeURIComponent(id)}`, { timeout: 20000 });
  const version = mapModrinthVersion(data);
  if (!version) throw new Error('La versión del mod no es válida.');
  return version;
}

function pickModrinthFile(version) {
  if (!version || !Array.isArray(version.files) || !version.files.length) return null;
  const jarFiles = version.files.filter((file) => /\.jar$/i.test(file.filename));
  return jarFiles.find((file) => file.primary) || jarFiles[0] || null;
}

async function installModrinthVersionFile(version, options = {}) {
  const file = pickModrinthFile(version);
  if (!file) throw new Error('Este mod no incluye un archivo .jar compatible.');

  assertHttpUrl(file.url, ['modrinth.com']);
  const directory = gamePaths().mods;
  ensureDir(directory);
  const safeName = sanitizeModName(file.filename);
  if (!safeName) throw new Error('El nombre del archivo del mod no es válido.');
  if (file.size > MAX_MOD_BYTES) throw new Error('El mod supera el límite de 250 MB.');

  const existing = path.join(directory, safeName);
  const metadata = {
    projectId: version.projectId,
    versionId: version.id,
    name: version.name,
    versionNumber: version.versionNumber
  };
  if (file.hashes?.sha512 && fs.existsSync(existing)) {
    try {
      const hash = await hashFile(existing, 'sha512');
      if (hash.toLowerCase() === file.hashes.sha512.toLowerCase()) {
        recordInstalledMod(safeName, metadata);
        return { file: safeName, alreadyInstalled: true };
      }
    } catch {
      /* se descarga de nuevo */
    }
  }

  const temporary = path.join(DATA_DIR, 'cache', 'downloads', `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.jar`);
  await downloadFile(file.url, temporary, {
    signal: options.signal,
    allowedDomains: ['modrinth.com'],
    maxBytes: MAX_MOD_BYTES,
    sha512: file.hashes?.sha512 || undefined,
    sha1: file.hashes?.sha1 || undefined,
    onProgress: options.onProgress
  });

  try {
    const target = uniqueModTarget(directory, safeName);
    await fs.promises.rename(temporary, target);
    const installedName = path.basename(target);
    recordInstalledMod(installedName, metadata);
    return { file: installedName, alreadyInstalled: false };
  } catch (error) {
    await fs.promises.rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

async function modrinthInstall(payload = {}) {
  const projectId = payload.projectId ? safeProjectId(payload.projectId) : null;
  if (payload.projectId && !projectId) throw new Error('El mod seleccionado no es válido.');
  const gameVersion = payload.gameVersion ? safeVersionId(payload.gameVersion) : null;
  const loader = payload.loader ? normalizeModLoader(payload.loader) : null;
  if (payload.gameVersion && !gameVersion) throw new Error('La versión de Minecraft no es válida.');
  if (payload.loader && !loader) throw new Error('El cargador seleccionado no es válido.');

  let version;
  if (payload.versionId) {
    version = await fetchModrinthVersion(payload.versionId);
    if (projectId && version.projectId && version.projectId !== projectId) {
      throw new Error('La versión del mod no pertenece al proyecto seleccionado.');
    }
  } else {
    if (!projectId) throw new Error('El mod seleccionado no es válido.');
    const data = await modrinthVersions({ projectId, gameVersion, loader });
    version = data.versions[0];
    if (!version) throw new Error('No se encontró una versión compatible de este mod.');
  }

  if (gameVersion && version.gameVersions.length && !version.gameVersions.includes(gameVersion)) {
    throw new Error(`Este mod no tiene una versión para Minecraft ${gameVersion}.`);
  }
  if (loader && version.loaders.length && !version.loaders.includes(loader)) {
    throw new Error(`Este mod no es compatible con ${LOADER_LABELS[loader]}.`);
  }

  const installed = [];
  const seen = new Set();

  const installTree = async (current, depth) => {
    if (!current || seen.has(current.id)) return;
    seen.add(current.id);
    const file = await installModrinthVersionFile(current, {
      signal: payload.signal,
      onProgress: (progress) => {
        if (typeof payload.onProgress === 'function') payload.onProgress({ ...progress, version: current.name });
      }
    });
    installed.push({
      id: current.id,
      projectId: current.projectId,
      name: current.name,
      version: current.versionNumber,
      file: file.file,
      alreadyInstalled: file.alreadyInstalled
    });

    if (depth >= 2) return;
    for (const dependency of current.dependencies) {
      if (dependency.type !== 'required') continue;
      let dependencyVersion = null;
      try {
        if (dependency.versionId) {
          dependencyVersion = await fetchModrinthVersion(dependency.versionId);
        } else if (dependency.projectId) {
          const data = await modrinthVersions({ projectId: dependency.projectId, gameVersion, loader });
          dependencyVersion = data.versions[0] || null;
        }
      } catch {
        dependencyVersion = null;
      }
      if (dependencyVersion) await installTree(dependencyVersion, depth + 1);
    }
  };

  await installTree(version, 0);
  return {
    provider: 'modrinth',
    projectId: projectId || version.projectId,
    version: {
      id: version.id,
      name: version.name,
      versionNumber: version.versionNumber
    },
    installed,
    added: installed.map((item) => item.file),
    alreadyInstalled: installed.every((item) => item.alreadyInstalled),
    mods: await listMods()
  };
}

function curseforgeApiKey() {
  const key = String(settings?.curseforgeApiKey || '').trim();
  if (!key) {
    throw new Error('CurseForge necesita una API key. Añádela en Ajustes → Mods e integraciones o usa Modrinth.');
  }
  return key;
}

function curseforgeLoaderType(loader) {
  return { forge: 1, fabric: 4, quilt: 5, neoforge: 6 }[loader] || undefined;
}

async function curseforgeRequest(pathname, options = {}) {
  const key = curseforgeApiKey();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  const external = options.signal;
  const abort = () => controller.abort();
  if (external) {
    if (external.aborted) throw abortError();
    external.addEventListener('abort', abort, { once: true });
  }

  try {
    const response = await fetch(`${CURSEFORGE_API}${pathname}`, {
      headers: {
        'x-api-key': key,
        'User-Agent': 'NexyLauncher/1.0 (Electron)',
        Accept: 'application/json'
      },
      signal: controller.signal
    });
    if (!response.ok) {
      let detail = '';
      try {
        const data = await response.json();
        detail = data?.error || data?.message || '';
      } catch {
        detail = '';
      }
      throw new Error(`CurseForge respondió HTTP ${response.status}${detail ? `: ${detail}` : ''}. Comprueba tu API key.`);
    }
    return await response.json();
  } catch (error) {
    if (external?.aborted) throw abortError();
    if (error.name === 'AbortError' || controller.signal.aborted) {
      throw new Error('CurseForge tardó demasiado en responder. Revisa tu conexión e inténtalo de nuevo.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
    if (external) external.removeEventListener('abort', abort);
  }
}

async function curseforgeSearch(payload = {}) {
  const query = truncateText(payload.query, 100);
  const gameVersion = payload.gameVersion ? safeVersionId(payload.gameVersion) : null;
  const loader = payload.loader ? normalizeModLoader(payload.loader) : null;
  const limit = Math.round(clamp(payload.limit ?? 20, 1, 30));
  const offset = Math.round(clamp(payload.offset ?? 0, 0, 500));
  if (payload.gameVersion && !gameVersion) throw new Error('La versión de Minecraft no es válida.');
  if (payload.loader && !loader) throw new Error('El cargador seleccionado no es válido.');

  const params = new URLSearchParams();
  params.set('gameId', String(CURSEFORGE_GAME_ID));
  params.set('classId', String(CURSEFORGE_MOD_CLASS));
  params.set('searchFilter', query);
  params.set('sortField', query ? '2' : '6');
  params.set('sortOrder', 'desc');
  params.set('pageSize', String(limit));
  params.set('index', String(offset));
  if (gameVersion) params.set('gameVersion', gameVersion);
  const loaderType = loader ? curseforgeLoaderType(loader) : undefined;
  if (loaderType) params.set('modLoaderType', String(loaderType));

  const data = await curseforgeRequest(`/mods/search?${params.toString()}`, { signal: payload.signal });
  const hits = (Array.isArray(data?.data) ? data.data : [])
    .filter((mod) => isPlainObject(mod) && Number.isFinite(Number(mod.id)))
    .map((mod) => ({
      id: String(mod.id),
      slug: typeof mod.slug === 'string' ? mod.slug : '',
      title: truncateText(mod.name, 100),
      description: truncateText(mod.summary, 220),
      author: (Array.isArray(mod.authors) ? mod.authors.map((author) => author?.name).filter(Boolean).join(', ') : '').slice(0, 60),
      icon: safeImageUrl(mod.logo?.thumbnailUrl || mod.logo?.url),
      downloads: Number(mod.downloadCount) || 0,
      follows: 0,
      categories: (Array.isArray(mod.categories) ? mod.categories.map((category) => category?.name).filter(Boolean) : []).slice(0, 8),
      versions: [],
      provider: 'curseforge'
    }));

  return {
    provider: 'curseforge',
    hits,
    total: Number(data?.pagination?.totalCount) || hits.length,
    offset: Number(data?.pagination?.index) || offset,
    limit
  };
}

function mapCurseForgeFile(file) {
  if (!isPlainObject(file)) return null;
  const id = Number(file.id);
  if (!Number.isFinite(id)) return null;
  return {
    id: String(id),
    displayName: truncateText(file.displayName, 120),
    fileName: truncateText(file.fileName, 180),
    datePublished: typeof file.fileDate === 'string' ? file.fileDate : null,
    downloads: Number(file.downloadCount) || 0,
    size: Number(file.fileLength) || 0,
    gameVersions: Array.isArray(file.gameVersions) ? file.gameVersions.map(String).slice(0, 40) : [],
    dependencies: (Array.isArray(file.dependencies) ? file.dependencies : [])
      .filter((dependency) => isPlainObject(dependency))
      .map((dependency) => ({
        modId: Number(dependency.modId) || null,
        relationType: Number(dependency.relationType) || 0
      })),
    downloadUrl: typeof file.downloadUrl === 'string' ? file.downloadUrl : '',
    available: file.isAvailable !== false
  };
}

async function curseforgeVersions(payload = {}) {
  const modId = Number(payload.modId);
  if (!Number.isFinite(modId) || modId <= 0) throw new Error('El mod seleccionado no es válido.');
  const gameVersion = payload.gameVersion ? safeVersionId(payload.gameVersion) : null;
  const loader = payload.loader ? normalizeModLoader(payload.loader) : null;
  if (payload.gameVersion && !gameVersion) throw new Error('La versión de Minecraft no es válida.');
  if (payload.loader && !loader) throw new Error('El cargador seleccionado no es válido.');

  const params = new URLSearchParams();
  params.set('pageSize', '50');
  params.set('index', '0');
  if (gameVersion) params.set('gameVersion', gameVersion);
  const loaderType = loader ? curseforgeLoaderType(loader) : undefined;
  if (loaderType) params.set('modLoaderType', String(loaderType));

  const data = await curseforgeRequest(`/mods/${modId}/files?${params.toString()}`, { signal: payload.signal });
  const versions = (Array.isArray(data?.data) ? data.data : []).map(mapCurseForgeFile).filter(Boolean);
  return { provider: 'curseforge', projectId: String(modId), versions };
}

function curseforgeDownloadUrl(file) {
  if (!file) return null;
  if (file.downloadUrl) {
    assertHttpUrl(file.downloadUrl, ['forgecdn.net', 'curseforge.com']);
    return file.downloadUrl;
  }
  const id = String(file.id);
  if (!/^\d{7,}$/.test(id)) return null;
  const url = `https://edge.forgecdn.net/files/${id.slice(0, 4)}/${id.slice(-3)}/${encodeURIComponent(file.fileName)}`;
  assertHttpUrl(url, ['forgecdn.net']);
  return url;
}

async function curseforgeInstall(payload = {}) {
  const modId = Number(payload.modId);
  if (!Number.isFinite(modId) || modId <= 0) throw new Error('El mod seleccionado no es válido.');

  let file = null;
  if (payload.fileId) {
    const id = Number(payload.fileId);
    if (!Number.isFinite(id) || id <= 0) throw new Error('La versión del mod no es válida.');
    const data = await curseforgeRequest(`/mods/${modId}/files/${id}`, { signal: payload.signal });
    file = mapCurseForgeFile(data?.data);
  } else {
    const data = await curseforgeVersions(payload);
    file = data.versions.find((item) => item.available && item.downloadUrl) || data.versions[0] || null;
  }

  if (!file) throw new Error('No se encontró una versión compatible de este mod.');
  if (!file.available) throw new Error('El autor de este mod no permite descargas desde terceros.');
  const url = curseforgeDownloadUrl(file);
  if (!url) throw new Error('Esta versión no tiene una descarga disponible.');

  const safeName = sanitizeModName(file.fileName);
  if (!safeName) throw new Error('El nombre del archivo del mod no es válido.');
  if (file.size > MAX_MOD_BYTES) throw new Error('El mod supera el límite de 250 MB.');

  const directory = gamePaths().mods;
  ensureDir(directory);
  const temporary = path.join(DATA_DIR, 'cache', 'downloads', `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.jar`);
  await downloadFile(url, temporary, {
    signal: payload.signal,
    allowedDomains: ['forgecdn.net', 'curseforge.com'],
    maxBytes: MAX_MOD_BYTES,
    onProgress: typeof payload.onProgress === 'function' ? payload.onProgress : undefined
  });

  const target = uniqueModTarget(directory, safeName);
  await fs.promises.rename(temporary, target);

  return {
    provider: 'curseforge',
    projectId: String(modId),
    version: { id: file.id, name: file.displayName, versionNumber: file.fileName },
    installed: [{
      id: file.id,
      name: file.displayName,
      version: file.fileName,
      file: path.basename(target),
      alreadyInstalled: false
    }],
    added: [path.basename(target)],
    mods: await listMods()
  };
}

function uniqueModTarget(directory, filename) {
  const parsed = path.parse(filename);
  let candidate = path.join(directory, filename);
  let index = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(directory, `${parsed.name} (${index})${parsed.ext}`);
    index++;
  }
  return candidate;
}

function sanitizeModName(filename) {
  const base = path.basename(String(filename)).replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_');
  if (!/\.jar$/i.test(base)) return null;
  if (base.length > 180) return null;
  return base;
}

const MOD_INDEX_FOLDER = '.nexy';
const MOD_INDEX_FILE = 'mods.json';

function modIndexPath() {
  return path.join(gamePaths().gameRoot, MOD_INDEX_FOLDER, MOD_INDEX_FILE);
}

function modIndexKey(filename) {
  const base = path.basename(String(filename || ''));
  if (!base) return null;
  return base.replace(/\.disabled$/i, '');
}

function readModIndex() {
  const data = readJson(modIndexPath(), {});
  return isPlainObject(data) ? data : {};
}

function writeModIndex(index) {
  writeJson(modIndexPath(), index);
}

function recordInstalledMod(filename, metadata = {}) {
  const key = modIndexKey(filename);
  if (!key) return;
  const index = readModIndex();
  index[key] = {
    projectId: safeProjectId(metadata.projectId),
    versionId: safeProjectId(metadata.versionId),
    versionNumber: truncateText(metadata.versionNumber, 80),
    name: truncateText(metadata.name, 120),
    installedAt: new Date().toISOString()
  };
  writeModIndex(index);
}

function forgetInstalledMod(filename) {
  const key = modIndexKey(filename);
  if (!key) return;
  const index = readModIndex();
  if (!Object.prototype.hasOwnProperty.call(index, key)) return;
  delete index[key];
  writeModIndex(index);
}

async function listMods() {
  const directory = gamePaths().mods;
  ensureDir(directory);
  const index = readModIndex();
  let entries;
  try {
    entries = await fs.promises.readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  const result = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!/\.jar(\.disabled)?$/i.test(entry.name)) continue;
    let stat;
    try {
      stat = await fs.promises.stat(path.join(directory, entry.name));
    } catch {
      continue;
    }
    const key = modIndexKey(entry.name);
    const metadata = key && isPlainObject(index[key]) ? index[key] : null;
    result.push({
      file: entry.name,
      enabled: !/\.disabled$/i.test(entry.name),
      size: stat.size,
      modified: stat.mtime.toISOString(),
      projectId: safeProjectId(metadata?.projectId) || null,
      versionId: safeProjectId(metadata?.versionId) || null,
      name: truncateText(metadata?.name, 120) || null,
      versionNumber: truncateText(metadata?.versionNumber, 80) || null
    });
  }

  return result.sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.file.localeCompare(b.file, undefined, { sensitivity: 'base' }));
}

async function setModEnabled(file, enabled) {
  const directory = gamePaths().mods;
  const base = path.basename(String(file || ''));
  if (!base) throw new Error('Archivo inválido.');
  const source = path.join(directory, base);
  if (!fs.existsSync(source)) throw new Error('Ese mod ya no existe.');
  const isEnabled = !/\.disabled$/i.test(base);
  if (isEnabled === Boolean(enabled)) return false;
  const target = enabled ? source.replace(/\.disabled$/i, '') : `${source}.disabled`;
  if (fs.existsSync(target)) throw new Error('Ya existe un archivo con ese nombre.');
  await fs.promises.rename(source, target);
  return true;
}

async function selectModVersion(projectId, file) {
  const id = safeProjectId(projectId);
  if (!id) throw new Error('El mod seleccionado no es válido.');
  const base = path.basename(String(file || ''));
  if (!base) throw new Error('Archivo inválido.');

  const mods = await listMods();
  const group = mods.filter((mod) => mod.projectId === id);
  const selected = group.find((mod) => mod.file === base);
  if (!selected) throw new Error('Ese archivo no pertenece al mod seleccionado.');
  if (group.length < 2) return mods;

  for (const mod of group) {
    if (mod.file !== base && mod.enabled) await setModEnabled(mod.file, false);
  }
  if (!selected.enabled) await setModEnabled(base, true);
  return listMods();
}

function modUpdateItem(mod, version) {
  const file = version ? pickModrinthFile(version) : null;
  return {
    file: mod.file,
    projectId: mod.projectId,
    name: version?.name || mod.name || mod.file,
    currentVersion: mod.versionNumber || '',
    versionNumber: version?.versionNumber || '',
    versionId: version?.id || '',
    versionType: version?.versionType || 'release',
    changelog: version?.changelog || '',
    datePublished: version?.datePublished || null,
    gameVersions: version?.gameVersions || [],
    loaders: version?.loaders || [],
    filename: file?.filename || '',
    size: file?.size || 0,
    enabled: mod.enabled,
    upToDate: Boolean(version && mod.versionId && version.id === mod.versionId),
    compatible: Boolean(version)
  };
}

async function checkModUpdates() {
  const instance = activeInstance();
  const gameVersion = safeVersionId(instance?.version) || safeVersionId(settings.lastVersion) || null;
  const loader = instance && instance.loader !== 'vanilla' ? normalizeModLoader(instance.loader) : null;
  const mods = await listMods();
  const tracked = mods.filter((mod) => mod.projectId);
  const items = [];
  const errors = [];

  if (!gameVersion) {
    return {
      instance: instance?.name || '',
      gameVersion: null,
      loader,
      total: mods.length,
      tracked: tracked.length,
      updates: [],
      items: [],
      errors: [],
      needsVersion: true
    };
  }

  if (!tracked.length) {
    return {
      instance: instance?.name || '',
      gameVersion,
      loader,
      total: mods.length,
      tracked: 0,
      updates: [],
      items: [],
      errors: []
    };
  }

  let cursor = 0;
  const worker = async () => {
    while (cursor < tracked.length) {
      const mod = tracked[cursor++];
      try {
        const data = await modrinthVersions({ projectId: mod.projectId, gameVersion, loader });
        const version = data.versions[0] || null;
        items.push(modUpdateItem(mod, version));
      } catch (error) {
        errors.push({ file: mod.file, projectId: mod.projectId, error: humanError(error) });
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(4, tracked.length) }, worker));

  items.sort((a, b) => Number(b.upToDate) - Number(a.upToDate) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  const updates = items.filter((item) => item.compatible && !item.upToDate);
  return {
    instance: instance?.name || '',
    gameVersion,
    loader,
    total: mods.length,
    tracked: tracked.length,
    updates,
    items,
    errors
  };
}

async function updateModrinthVersionFile(version, oldMod) {
  const file = pickModrinthFile(version);
  if (!file) throw new Error('Esta versión del mod no incluye un archivo .jar compatible.');
  assertHttpUrl(file.url, ['modrinth.com']);
  const directory = gamePaths().mods;
  ensureDir(directory);
  const safeName = sanitizeModName(file.filename);
  if (!safeName) throw new Error('El nombre del archivo del mod no es válido.');
  if (file.size > MAX_MOD_BYTES) throw new Error('El mod supera el límite de 250 MB.');

  const temporary = path.join(DATA_DIR, 'cache', 'downloads', `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.jar`);
  await downloadFile(file.url, temporary, {
    allowedDomains: ['modrinth.com'],
    maxBytes: MAX_MOD_BYTES,
    sha512: file.hashes?.sha512 || undefined,
    sha1: file.hashes?.sha1 || undefined
  });

  const oldPath = path.join(directory, path.basename(oldMod.file));
  const wasDisabled = /\.disabled$/i.test(oldMod.file);
  const target = path.join(directory, safeName);
  try {
    const finalTarget = fs.existsSync(target) && path.resolve(target) !== path.resolve(oldPath)
      ? uniqueModTarget(directory, safeName)
      : target;
    if (fs.existsSync(oldPath)) await fs.promises.unlink(oldPath);
    await fs.promises.rename(temporary, finalTarget);
    let finalName = path.basename(finalTarget);
    if (wasDisabled) {
      finalName = `${finalName}.disabled`;
      await fs.promises.rename(finalTarget, path.join(directory, finalName));
    }
    recordInstalledMod(finalName, {
      projectId: version.projectId,
      versionId: version.id,
      name: version.name,
      versionNumber: version.versionNumber
    });
    return {
      file: finalName,
      previous: oldMod.file,
      name: version.name,
      version: version.versionNumber
    };
  } catch (error) {
    await fs.promises.rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

async function updateMods(payload = {}) {
  const requested = Array.isArray(payload.mods) ? payload.mods.slice(0, 30) : [];
  if (!requested.length) throw new Error('No hay mods seleccionados para actualizar.');
  const updated = [];
  const failed = [];

  for (const entry of requested) {
    try {
      const file = path.basename(String(entry.file || ''));
      const versionId = safeProjectId(entry.versionId);
      if (!file || !versionId) throw new Error('Datos de actualización no válidos.');
      const mods = await listMods();
      const current = mods.find((mod) => mod.file === file);
      if (!current) throw new Error('Ese mod ya no existe.');
      const version = await fetchModrinthVersion(versionId);
      if (current.projectId && version.projectId && current.projectId !== version.projectId) {
        throw new Error('La versión no pertenece a ese mod.');
      }
      const result = await updateModrinthVersionFile(version, current);
      updated.push(result);
    } catch (error) {
      failed.push({ file: entry.file, error: humanError(error) });
    }
  }

  return { updated, failed, mods: await listMods() };
}

async function addModFiles(paths) {
  const directory = gamePaths().mods;
  ensureDir(directory);
  const added = [];
  const skipped = [];

  for (const source of paths.slice(0, 30)) {
    const name = sanitizeModName(source);
    if (!name) {
      skipped.push(path.basename(String(source)));
      continue;
    }
    try {
      const stat = await fs.promises.stat(source);
      if (!stat.isFile() || stat.size > 250 * 1024 * 1024) {
        skipped.push(name);
        continue;
      }
      const target = uniqueModTarget(directory, name);
      await fs.promises.copyFile(source, target);
      added.push(path.basename(target));
    } catch {
      skipped.push(name);
    }
  }

  return { added, skipped, mods: await listMods() };
}

async function addModBuffer(name, data) {
  const directory = gamePaths().mods;
  ensureDir(directory);
  const safeName = sanitizeModName(name);
  if (!safeName) throw new Error('El archivo debe ser un .jar válido.');

  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(new Uint8Array(data));
  if (!buffer.length) throw new Error('El archivo está vacío.');
  if (buffer.length > 250 * 1024 * 1024) throw new Error('El archivo supera el límite de 250 MB.');

  const target = uniqueModTarget(directory, safeName);
  await fs.promises.writeFile(target, buffer);
  return { added: path.basename(target), skipped: [], mods: await listMods() };
}

/* -------------------------------------------------------------------------- */
/*                     Mundos, recursos, shaders y capturas                   */
/* -------------------------------------------------------------------------- */

const CONTENT_KINDS = {
  resourcepacks: { pathKey: 'resourcePacks', label: 'resource pack' },
  shaderpacks: { pathKey: 'shaderPacks', label: 'shader pack' }
};

function contentDirectory(kind) {
  const config = CONTENT_KINDS[String(kind)];
  if (!config) throw new Error('Tipo de contenido no válido.');
  return gamePaths()[config.pathKey];
}

function sanitizeContentName(filename) {
  const base = path.basename(String(filename || '')).replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_');
  if (!/\.(zip|jar)(\.disabled)?$/i.test(base)) return null;
  if (base.length > 180) return null;
  return base;
}

async function listContent(kind) {
  const directory = contentDirectory(kind);
  ensureDir(directory);
  let entries;
  try {
    entries = await fs.promises.readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  const result = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/\.(zip|jar)(\.disabled)?$/i.test(entry.name)) continue;
    try {
      const stat = await fs.promises.stat(path.join(directory, entry.name));
      result.push({
        file: entry.name,
        enabled: !/\.disabled$/i.test(entry.name),
        size: stat.size,
        modified: stat.mtime.toISOString()
      });
    } catch {
      /* archivo eliminado mientras se leía */
    }
  }
  return result.sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.file.localeCompare(b.file, undefined, { sensitivity: 'base' }));
}

async function addContentFiles(kind, paths) {
  const directory = contentDirectory(kind);
  ensureDir(directory);
  const added = [];
  const skipped = [];
  for (const source of (Array.isArray(paths) ? paths : []).slice(0, 40)) {
    const name = sanitizeContentName(source);
    if (!name) {
      skipped.push(path.basename(String(source)));
      continue;
    }
    try {
      const stat = await fs.promises.stat(source);
      if (!stat.isFile() || stat.size > 250 * 1024 * 1024) {
        skipped.push(name);
        continue;
      }
      const target = uniqueModTarget(directory, name);
      await fs.promises.copyFile(source, target);
      added.push(path.basename(target));
    } catch {
      skipped.push(name);
    }
  }
  return { added, skipped, files: await listContent(kind) };
}

async function toggleContent(kind, file) {
  const directory = contentDirectory(kind);
  const base = sanitizeContentName(file);
  if (!base) throw new Error('Archivo inválido.');
  const source = path.join(directory, base);
  if (!fs.existsSync(source)) throw new Error('Ese archivo ya no existe.');
  const enabled = !/\.disabled$/i.test(base);
  const target = enabled ? `${source}.disabled` : source.replace(/\.disabled$/i, '');
  if (fs.existsSync(target)) throw new Error('Ya existe un archivo con ese nombre.');
  await fs.promises.rename(source, target);
  return listContent(kind);
}

async function deleteContent(kind, file) {
  const directory = contentDirectory(kind);
  const base = sanitizeContentName(file);
  if (!base) throw new Error('Archivo inválido.');
  const target = path.join(directory, base);
  if (!fs.existsSync(target)) throw new Error('Ese archivo ya no existe.');
  await fs.promises.unlink(target);
  return listContent(kind);
}

function worldsDirectory() {
  return path.join(gamePaths().gameRoot, 'saves');
}

function worldBackupsDirectory() {
  return path.join(gamePaths().gameRoot, '.nexy', 'backups', 'worlds');
}

function sanitizeWorldName(value) {
  const base = path.basename(String(value || ''));
  if (!base || base === '.' || base === '..') return null;
  if (/[<>:"/\\|?*\u0000-\u001F]/.test(base)) return null;
  return base.length <= 120 ? base : null;
}

function worldPath(name) {
  const base = sanitizeWorldName(name);
  if (!base) throw new Error('Mundo no válido.');
  const target = path.join(worldsDirectory(), base);
  const root = worldsDirectory();
  if (!target.startsWith(root + path.sep)) throw new Error('Ruta de mundo no válida.');
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) throw new Error('Ese mundo ya no existe.');
  return target;
}

async function directorySize(directory, maxEntries = 30000) {
  let total = 0;
  let seen = 0;
  const walk = async (current) => {
    if (seen >= maxEntries) return;
    let entries;
    try {
      entries = await fs.promises.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (seen >= maxEntries) return;
      seen++;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) {
        try {
          total += (await fs.promises.stat(full)).size;
        } catch {
          /* archivo eliminado */
        }
      }
    }
  };
  await walk(directory);
  return total;
}

async function listWorlds() {
  const directory = worldsDirectory();
  ensureDir(directory);
  let entries;
  try {
    entries = await fs.promises.readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  const worlds = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = path.join(directory, entry.name);
    try {
      const stat = await fs.promises.stat(full);
      worlds.push({
        name: entry.name,
        size: await directorySize(full),
        modified: stat.mtime.toISOString()
      });
    } catch {
      /* mundo eliminado mientras se leía */
    }
  }
  return worlds.sort((a, b) => String(b.modified).localeCompare(String(a.modified)));
}

function uniqueDirectoryTarget(parent, name) {
  let candidate = path.join(parent, name);
  let index = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(parent, `${name} (${index})`);
    index++;
  }
  return candidate;
}

async function backupWorld(name) {
  const source = worldPath(name);
  const directory = worldBackupsDirectory();
  ensureDir(directory);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = uniqueModTarget(directory, `${path.basename(source)}-${stamp}.zip`);
  const zip = new AdmZip();
  zip.addLocalFolder(source, '');
  zip.writeZip(target);
  return { file: path.basename(target), size: fs.statSync(target).size };
}

async function listWorldBackups() {
  const directory = worldBackupsDirectory();
  ensureDir(directory);
  let entries;
  try {
    entries = await fs.promises.readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  const backups = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/\.zip$/i.test(entry.name)) continue;
    try {
      const stat = await fs.promises.stat(path.join(directory, entry.name));
      backups.push({ file: entry.name, size: stat.size, modified: stat.mtime.toISOString() });
    } catch {
      /* archivo eliminado */
    }
  }
  return backups.sort((a, b) => String(b.modified).localeCompare(String(a.modified)));
}

function safeZipEntries(zip) {
  return zip.getEntries().every((entry) => {
    const name = String(entry.entryName || '').replace(/\\/g, '/');
    return name && !name.startsWith('/') && !name.split('/').includes('..') && !/^[A-Za-z]:/.test(name);
  });
}

async function deleteWorldBackup(file) {
  const base = path.basename(String(file || ''));
  if (!/^[^<>:"/\\|?*\u0000-\u001F]+\.zip$/i.test(base)) throw new Error('Copia de seguridad no válida.');
  const target = path.join(worldBackupsDirectory(), base);
  if (!fs.existsSync(target)) throw new Error('Esa copia de seguridad ya no existe.');
  await fs.promises.unlink(target);
  return listWorldBackups();
}

async function restoreWorldBackup(file) {
  const base = path.basename(String(file || ''));
  if (!/^[^<>:"/\\|?*\u0000-\u001F]+\.zip$/i.test(base)) throw new Error('Copia de seguridad no válida.');
  const source = path.join(worldBackupsDirectory(), base);
  if (!fs.existsSync(source)) throw new Error('Esa copia de seguridad ya no existe.');
  const zip = new AdmZip(source);
  if (!safeZipEntries(zip)) throw new Error('La copia de seguridad contiene rutas no válidas.');
  const directory = worldsDirectory();
  ensureDir(directory);
  const target = uniqueDirectoryTarget(directory, `${path.parse(base).name} (restaurado)`);
  zip.extractAllTo(target, true);
  return { name: path.basename(target), worlds: await listWorlds() };
}

async function duplicateWorld(name) {
  const source = worldPath(name);
  const target = uniqueDirectoryTarget(worldsDirectory(), `${path.basename(source)} (copia)`);
  await fs.promises.cp(source, target, { recursive: true, errorOnExist: true });
  return { name: path.basename(target), worlds: await listWorlds() };
}

async function deleteWorld(name) {
  const target = worldPath(name);
  await fs.promises.rm(target, { recursive: true, force: true });
  return listWorlds();
}

function screenshotsDirectory() {
  return path.join(gamePaths().gameRoot, 'screenshots');
}

function sanitizeScreenshotName(value) {
  const base = path.basename(String(value || ''));
  if (!/\.(png|jpe?g|webp)$/i.test(base)) return null;
  return base.length <= 180 ? base : null;
}

function screenshotDataUrl(file, maxWidth = 320) {
  try {
    const stat = fs.statSync(file);
    if (stat.size > 20 * 1024 * 1024) return null;
    const image = nativeImage.createFromPath(file);
    if (image.isEmpty()) return null;
    const size = image.getSize();
    const resized = size.width > maxWidth ? image.resize({ width: maxWidth }) : image;
    return `data:image/jpeg;base64,${resized.toJPEG(72).toString('base64')}`;
  } catch {
    return null;
  }
}

async function listScreenshots() {
  const directory = screenshotsDirectory();
  ensureDir(directory);
  let entries;
  try {
    entries = await fs.promises.readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  const screenshots = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/\.(png|jpe?g|webp)$/i.test(entry.name)) continue;
    const full = path.join(directory, entry.name);
    try {
      const stat = await fs.promises.stat(full);
      screenshots.push({
        file: entry.name,
        size: stat.size,
        modified: stat.mtime.toISOString(),
        thumb: screenshotDataUrl(full)
      });
    } catch {
      /* archivo eliminado */
    }
  }
  return screenshots
    .sort((a, b) => String(b.modified).localeCompare(String(a.modified)))
    .slice(0, 80);
}

async function readScreenshot(file) {
  const base = sanitizeScreenshotName(file);
  if (!base) throw new Error('Captura no válida.');
  const full = path.join(screenshotsDirectory(), base);
  if (!fs.existsSync(full)) throw new Error('Esa captura ya no existe.');
  const image = nativeImage.createFromPath(full);
  if (image.isEmpty()) throw new Error('No se pudo leer la captura.');
  const size = image.getSize();
  const resized = size.width > 1600 ? image.resize({ width: 1600 }) : image;
  return { file: base, image: `data:image/jpeg;base64,${resized.toJPEG(86).toString('base64')}` };
}

async function deleteScreenshot(file) {
  const base = sanitizeScreenshotName(file);
  if (!base) throw new Error('Captura no válida.');
  const full = path.join(screenshotsDirectory(), base);
  if (!fs.existsSync(full)) throw new Error('Esa captura ya no existe.');
  await fs.promises.unlink(full);
  return listScreenshots();
}

/* -------------------------------------------------------------------------- */
/*                    Importar, exportar y reparar instancias                 */
/* -------------------------------------------------------------------------- */

function emitInstanceProgress(id, phase, message, percent = null) {
  sendToRenderer('instances:progress', {
    id: id || null,
    phase,
    message,
    percent: typeof percent === 'number' ? Math.max(0, Math.min(100, Math.round(percent))) : null
  });
}

function safeRelativePath(value) {
  const normalized = String(value ?? '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.length > 400) return null;
  const parts = normalized.split('/').filter((part) => part && part !== '.');
  if (!parts.length || parts.some((part) => part === '..' || part.includes(':'))) return null;
  return parts.join('/');
}

function uniqueInstanceName(base) {
  const clean = sanitizeInstanceName(base) || 'Modpack';
  const names = new Set((settings.instances || []).map((instance) => instance.name.toLowerCase()));
  if (!names.has(clean.toLowerCase())) return clean;
  for (let index = 2; index < 1000; index++) {
    const suffix = ` (${index})`;
    const candidate = `${clean.slice(0, Math.max(1, 40 - suffix.length))}${suffix}`;
    if (!names.has(candidate.toLowerCase())) return candidate;
  }
  return `${clean.slice(0, 30)}-${Date.now().toString(36)}`;
}

function registerInstance({ name, root, version, loader, loaderVersion, source, description }) {
  const instance = {
    id: crypto.randomUUID(),
    name: uniqueInstanceName(name),
    gameRoot: path.resolve(root),
    createdAt: new Date().toISOString(),
    lastPlayedAt: null,
    version: safeVersionId(version) || '',
    loader: normalizeLoader(loader) || 'vanilla',
    loaderVersion: safeVersionId(loaderVersion) || '',
    description: sanitizeInstanceDescription(description),
    cover: '',
    settings: normalizeInstanceSettings(null),
    source: typeof source === 'string' ? source.slice(0, 80) : 'import'
  };
  if (instance.loader === 'vanilla') instance.loaderVersion = '';
  settings.instances.push(instance);
  ensureDir(instance.gameRoot);
  for (const directory of ['mods', 'versions', 'logs', 'saves', 'resourcepacks', 'shaderpacks']) {
    ensureDir(path.join(instance.gameRoot, directory));
  }
  writeInstanceMarker(instance);
  switchInstance(instance.id);
  return instance;
}

function zipEntries(zip) {
  return zip.getEntries().filter((entry) => !entry.isDirectory);
}

function findZipEntry(zip, name) {
  const target = String(name).replace(/\\/g, '/').toLowerCase();
  return zip.getEntries().find((entry) => !entry.isDirectory && entry.entryName.replace(/\\/g, '/').toLowerCase() === target) || null;
}

function readZipJson(zip, name) {
  const entry = findZipEntry(zip, name);
  if (!entry) return null;
  if (Number(entry.header?.size) > 8 * 1024 * 1024) {
    throw new Error(`El archivo ${name} del modpack es demasiado grande.`);
  }
  try {
    return JSON.parse(entry.getData().toString('utf8').replace(/^\uFEFF/, ''));
  } catch {
    throw new Error(`El archivo ${name} del modpack no contiene JSON válido.`);
  }
}

function extractZipFolder(zip, prefix, destination, options = {}) {
  const cleanPrefix = String(prefix || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const root = path.resolve(destination);
  const totalLimit = Number(options.maxBytes) || MAX_PACK_BYTES;
  let written = 0;
  let files = 0;
  const entries = zipEntries(zip);

  for (const entry of entries) {
    const entryName = entry.entryName.replace(/\\/g, '/');
    if (cleanPrefix && !entryName.startsWith(`${cleanPrefix}/`)) continue;
    const relative = safeRelativePath(cleanPrefix ? entryName.slice(cleanPrefix.length + 1) : entryName);
    if (!relative) continue;
    const target = path.resolve(root, relative);
    if (!target.startsWith(`${root}${path.sep}`) && target !== root) continue;
    const declared = Number(entry.header?.size) || 0;
    if (declared > MAX_PACK_ENTRY_BYTES) throw new Error(`El archivo ${relative} del modpack es demasiado grande.`);
    written += declared;
    if (written > totalLimit) throw new Error('El modpack supera el tamaño máximo permitido al extraerse.');
    const data = entry.getData();
    ensureDir(path.dirname(target));
    fs.writeFileSync(target, data);
    files++;
  }

  return { files, bytes: written };
}

async function downloadPackFile(url, destination, options = {}) {
  assertHttpUrl(url, options.allowedDomains || ['modrinth.com', 'github.com', 'githubusercontent.com', 'forgecdn.net', 'curseforge.com']);
  const target = path.resolve(destination);
  const root = path.resolve(options.root);
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error('El modpack intenta escribir fuera de la instancia.');

  if (fs.existsSync(target)) {
    try {
      const stat = await fs.promises.stat(target);
      const expectedSize = Number(options.size) || 0;
      if (stat.size > 0 && (!expectedSize || stat.size === expectedSize)) {
        let valid = true;
        if (options.sha512) valid = (await hashFile(target, 'sha512')).toLowerCase() === String(options.sha512).toLowerCase();
        if (valid && options.sha1) valid = (await hashFile(target, 'sha1')).toLowerCase() === String(options.sha1).toLowerCase();
        if (valid) return { skipped: true, size: stat.size };
      }
    } catch {
      /* se descarga de nuevo */
    }
  }

  await downloadFile(url, target, {
    signal: options.signal,
    allowedDomains: options.allowedDomains,
    maxBytes: Number(options.maxBytes) || MAX_PACK_ENTRY_BYTES,
    sha1: options.sha1,
    sha512: options.sha512,
    onProgress: options.onProgress
  });
  return { skipped: false, size: (await fs.promises.stat(target)).size };
}

function loaderFromPackDependencies(dependencies) {
  if (!isPlainObject(dependencies)) return { loader: 'vanilla', loaderVersion: '' };
  const order = [
    ['fabric-loader', 'fabric'],
    ['quilt-loader', 'quilt'],
    ['neoforge', 'neoforge'],
    ['forge', 'forge']
  ];
  for (const [key, loader] of order) {
    const value = dependencies[key];
    if (typeof value === 'string' && safeVersionId(value)) {
      return { loader, loaderVersion: safeVersionId(value) };
    }
  }
  return { loader: 'vanilla', loaderVersion: '' };
}

function loaderFromCurseForgeId(id) {
  const value = String(id || '').trim();
  const match = /^(forge|neoforge|fabric|quilt)-(.+)$/i.exec(value);
  if (!match) return { loader: 'vanilla', loaderVersion: '' };
  return {
    loader: normalizeLoader(match[1]) || 'vanilla',
    loaderVersion: safeVersionId(match[2]) || ''
  };
}

async function importModrinthPack(zip, manifest, options = {}) {
  const minecraft = safeVersionId(manifest?.dependencies?.minecraft);
  if (!minecraft) throw new Error('El modpack de Modrinth no indica una versión de Minecraft válida.');
  const { loader, loaderVersion } = loaderFromPackDependencies(manifest.dependencies);
  const name = sanitizeInstanceName(manifest?.name) || options.fallbackName || 'Modpack de Modrinth';
  const root = uniqueInstanceDirectory(name);
  ensureDir(root);
  const instance = registerInstance({
    name,
    root,
    version: minecraft,
    loader,
    loaderVersion,
    source: 'modrinth',
    description: manifest?.summary
  });

  try {
    emitInstanceProgress(instance.id, 'extract', 'Extrayendo overrides del modpack…', 5);
    extractZipFolder(zip, 'overrides', root);
    extractZipFolder(zip, 'client-overrides', root);

    const files = (Array.isArray(manifest.files) ? manifest.files : [])
      .filter((file) => isPlainObject(file) && typeof file.path === 'string' && Array.isArray(file.downloads) && file.downloads.length)
      .filter((file) => file.env?.client !== 'unsupported')
      .slice(0, 2000);

    let index = 0;
    let installed = 0;
    const warnings = [];
    for (const file of files) {
      if (options.signal?.aborted) throw abortError();
      const relative = safeRelativePath(file.path);
      if (!relative) {
        warnings.push(`Ruta no válida: ${file.path}`);
        continue;
      }
      const destination = path.join(root, relative);
      const url = file.downloads.find((value) => typeof value === 'string' && /^https:\/\//i.test(value));
      if (!url) {
        warnings.push(`Sin descarga para ${relative}`);
        continue;
      }
      index++;
      emitInstanceProgress(
        instance.id,
        'download',
        `Descargando ${path.basename(relative)} (${index}/${files.length})…`,
        files.length ? 5 + Math.round((index / files.length) * 90) : null
      );
      try {
        await downloadPackFile(url, destination, {
          root,
          sha1: file.hashes?.sha1,
          sha512: file.hashes?.sha512,
          size: Number(file.fileSize) || 0,
          maxBytes: MAX_PACK_ENTRY_BYTES,
          signal: options.signal,
          allowedDomains: ['modrinth.com', 'github.com', 'githubusercontent.com']
        });
        installed++;
      } catch (error) {
        if (error.name === 'AbortError') throw error;
        warnings.push(`${path.basename(relative)}: ${humanError(error)}`);
      }
    }

    emitInstanceProgress(instance.id, 'done', 'Modpack importado.', 100);
    return { instance, installed, warnings, provider: 'modrinth' };
  } catch (error) {
    settings.instances = settings.instances.filter((item) => item.id !== instance.id);
    if (settings.activeInstanceId === instance.id) {
      const next = settings.instances[0];
      if (next) switchInstance(next.id);
    }
    saveSettings();
    throw error;
  }
}

async function importCurseForgePack(zip, manifest, options = {}) {
  const minecraft = safeVersionId(manifest?.minecraft?.version);
  if (!minecraft) throw new Error('El modpack de CurseForge no indica una versión de Minecraft válida.');
  const modLoader = (Array.isArray(manifest?.minecraft?.modLoaders) ? manifest.minecraft.modLoaders : [])
    .find((item) => item?.primary) || manifest?.minecraft?.modLoaders?.[0];
  const { loader, loaderVersion } = loaderFromCurseForgeId(modLoader?.id);

  const name = sanitizeInstanceName(manifest?.name) || options.fallbackName || 'Modpack de CurseForge';
  const root = uniqueInstanceDirectory(name);
  ensureDir(root);
  const instance = registerInstance({
    name,
    root,
    version: minecraft,
    loader,
    loaderVersion,
    source: 'curseforge'
  });

  try {
    const overrides = safeRelativePath(manifest?.overrides || 'overrides') || 'overrides';
    emitInstanceProgress(instance.id, 'extract', 'Extrayendo overrides del modpack…', 5);
    extractZipFolder(zip, overrides, root);

    const files = (Array.isArray(manifest.files) ? manifest.files : [])
      .filter((file) => isPlainObject(file) && Number.isFinite(Number(file.projectID)) && Number.isFinite(Number(file.fileID)))
      .slice(0, 2000);
    if (files.length && !String(settings.curseforgeApiKey || '').trim()) {
      throw new Error('CurseForge necesita una API key para descargar los mods de este modpack. Añádela en Ajustes → Mods e integraciones o usa un modpack de Modrinth.');
    }

    let installed = 0;
    let index = 0;
    const warnings = [];
    for (const file of files) {
      if (options.signal?.aborted) throw abortError();
      index++;
      emitInstanceProgress(
        instance.id,
        'download',
        `Descargando mod ${index}/${files.length} de CurseForge…`,
        files.length ? 5 + Math.round((index / files.length) * 90) : null
      );
      try {
        const data = await curseforgeRequest(`/mods/${Number(file.projectID)}/files/${Number(file.fileID)}`, { signal: options.signal });
        const mapped = mapCurseForgeFile(data?.data);
        if (!mapped) throw new Error('CurseForge no devolvió datos del archivo.');
        if (!mapped.available) throw new Error('El autor no permite descargas desde terceros.');
        const url = curseforgeDownloadUrl(mapped);
        if (!url) throw new Error('No hay una descarga disponible.');
        const safeName = sanitizeModName(mapped.fileName);
        if (!safeName) throw new Error('El nombre del archivo no es válido.');
        await downloadPackFile(url, path.join(root, 'mods', safeName), {
          root,
          maxBytes: MAX_MOD_BYTES,
          signal: options.signal,
          allowedDomains: ['forgecdn.net', 'curseforge.com']
        });
        installed++;
      } catch (error) {
        if (error.name === 'AbortError') throw error;
        warnings.push(`Proyecto ${file.projectID}: ${humanError(error)}`);
      }
    }

    emitInstanceProgress(instance.id, 'done', 'Modpack importado.', 100);
    return { instance, installed, warnings, provider: 'curseforge' };
  } catch (error) {
    settings.instances = settings.instances.filter((item) => item.id !== instance.id);
    if (settings.activeInstanceId === instance.id) {
      const next = settings.instances[0];
      if (next) switchInstance(next.id);
    }
    saveSettings();
    throw error;
  }
}

async function importNexyPack(zip, manifest, options = {}) {
  const name = sanitizeInstanceName(manifest?.name) || options.fallbackName || 'Instancia importada';
  const root = uniqueInstanceDirectory(name);
  ensureDir(root);
  const instance = registerInstance({
    name,
    root,
    version: manifest?.version,
    loader: manifest?.loader,
    loaderVersion: manifest?.loaderVersion,
    source: 'nexy',
    description: manifest?.description
  });

  try {
    emitInstanceProgress(instance.id, 'extract', 'Extrayendo la instancia…', 10);
    extractZipFolder(zip, 'overrides', root);
    emitInstanceProgress(instance.id, 'done', 'Instancia importada.', 100);
    return { instance, installed: 0, warnings: [], provider: 'nexy' };
  } catch (error) {
    settings.instances = settings.instances.filter((item) => item.id !== instance.id);
    if (settings.activeInstanceId === instance.id) {
      const next = settings.instances[0];
      if (next) switchInstance(next.id);
    }
    saveSettings();
    throw error;
  }
}

async function importInstancePack(packPath, options = {}) {
  const source = path.resolve(String(packPath || ''));
  let stat;
  try {
    stat = await fs.promises.stat(source);
  } catch {
    throw new Error('El archivo del modpack no existe.');
  }
  if (!stat.isFile()) throw new Error('Selecciona un archivo .zip o .mrpack.');
  if (stat.size > MAX_PACK_BYTES) throw new Error('El modpack es demasiado grande.');

  let zip;
  try {
    zip = new AdmZip(source);
  } catch {
    throw new Error('No se pudo abrir el modpack. Comprueba que el archivo no esté dañado.');
  }

  const fallbackName = path.basename(source).replace(/\.(mrpack|zip)$/i, '');
  const modrinth = readZipJson(zip, 'modrinth.index.json');
  if (modrinth) {
    if (modrinth.game && modrinth.game !== 'minecraft') throw new Error('Este modpack no es de Minecraft.');
    return importModrinthPack(zip, modrinth, { ...options, fallbackName });
  }

  const manifest = readZipJson(zip, 'manifest.json');
  if (manifest && manifest.manifestType === 'minecraftModpack') {
    return importCurseForgePack(zip, manifest, { ...options, fallbackName });
  }

  const nexy = readZipJson(zip, 'nexy-pack.json');
  if (nexy && nexy.format === 'nexy-instance') {
    return importNexyPack(zip, nexy, { ...options, fallbackName });
  }

  throw new Error('El archivo no es un modpack compatible. Se admiten .mrpack de Modrinth, ZIP de CurseForge y exportaciones de NexyLauncher.');
}

function addFolderToZip(zip, sourceRoot, folder, zipPrefix, counters) {
  const absolute = path.join(sourceRoot, folder);
  if (!fs.existsSync(absolute)) return;
  const walk = (directory, relative) => {
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === '.nexy-instance.json') continue;
      const full = path.join(directory, entry.name);
      const nextRelative = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(full, nextRelative);
        continue;
      }
      if (!entry.isFile()) continue;
      if (folder === 'mods' && !/\.jar$/i.test(entry.name)) continue;
      let stat;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }
      if (!stat.size) continue;
      const data = fs.readFileSync(full);
      zip.addFile(`${zipPrefix}${nextRelative}`, data);
      counters.files++;
      counters.bytes += data.length;
    }
  };
  walk(absolute, folder);
}

function exportInstanceToZip(instance, destination, options = {}) {
  const format = options.format === 'zip' ? 'zip' : 'mrpack';
  const root = instance.gameRoot;
  const zip = new AdmZip();
  const counters = { files: 0, bytes: 0 };
  const folders = ['mods', 'config', 'defaultconfigs', 'resourcepacks', 'shaderpacks', 'scripts', 'kubejs'];
  if (options.includeWorlds) folders.push('saves');

  const dependencies = { minecraft: instance.version };
  const loaderVersion = safeVersionId(instance.loaderVersion);
  if (loaderVersion) {
    if (instance.loader === 'fabric') dependencies['fabric-loader'] = loaderVersion;
    else if (instance.loader === 'quilt') dependencies['quilt-loader'] = loaderVersion;
    else if (instance.loader === 'forge') dependencies.forge = loaderVersion;
    else if (instance.loader === 'neoforge') dependencies.neoforge = loaderVersion;
  }

  for (const folder of folders) {
    addFolderToZip(zip, root, folder, 'overrides/', counters);
  }
  for (const file of ['options.txt', 'optionsof.txt', 'servers.dat', 'usercache.json']) {
    const full = path.join(root, file);
    if (!fs.existsSync(full)) continue;
    try {
      const stat = fs.statSync(full);
      if (!stat.isFile() || !stat.size) continue;
      zip.addFile(`overrides/${file}`, fs.readFileSync(full));
      counters.files++;
      counters.bytes += stat.size;
    } catch {
      /* se omite el archivo */
    }
  }

  if (format === 'mrpack') {
    const index = {
      formatVersion: 1,
      game: 'minecraft',
      versionId: `nexy-${instance.id.slice(0, 8)}`,
      name: instance.name,
      summary: String(instance.description || '').trim() || `Modpack exportado desde NexyLauncher (${instance.name}).`,
      files: [],
      dependencies
    };
    zip.addFile('modrinth.index.json', Buffer.from(JSON.stringify(index, null, 2), 'utf8'));
  } else {
    const manifest = {
      format: 'nexy-instance',
      schema: 1,
      name: instance.name,
      version: instance.version || '',
      loader: instance.loader || 'vanilla',
      loaderVersion: instance.loaderVersion || '',
      description: instance.description || '',
      includeWorlds: Boolean(options.includeWorlds),
      createdAt: new Date().toISOString(),
      exportedBy: 'NexyLauncher 1.0'
    };
    zip.addFile('nexy-pack.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));
  }

  zip.writeZip(destination);
  return counters;
}

function safeExportName(name) {
  return String(name || 'instancia')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60) || 'instancia';
}

function collectAssetObjects(indexData) {
  const objects = isPlainObject(indexData?.objects) ? indexData.objects : {};
  const result = [];
  for (const object of Object.values(objects)) {
    if (!isPlainObject(object)) continue;
    const hash = String(object.hash || '').toLowerCase();
    if (!/^[a-f0-9]{40}$/.test(hash)) continue;
    result.push({ hash, size: Number(object.size) || 0 });
  }
  return result;
}

function findAssetIndex(root, assetIndex, versionIds = []) {
  if (!isPlainObject(assetIndex) || !assetIndex.id) return null;
  const directory = path.join(root, 'assets', 'indexes');
  const candidates = [assetIndex.id, ...versionIds]
    .map((value) => safeVersionId(value))
    .filter(Boolean);
  for (const id of new Set(candidates)) {
    const file = path.join(directory, `${id}.json`);
    const data = readJson(file, null);
    if (isPlainObject(data)) return { path: file, data, id };
  }
  return null;
}

function missingAssetsFor(root, indexData) {
  const objects = collectAssetObjects(indexData);
  const missing = [];
  for (const object of objects) {
    const file = path.join(root, 'assets', 'objects', object.hash.slice(0, 2), object.hash);
    try {
      const stat = fs.statSync(file);
      if (!stat.isFile() || !stat.size || (object.size && stat.size !== object.size)) missing.push(object);
    } catch {
      missing.push(object);
    }
  }
  return { total: objects.length, missing };
}

async function ensureAssetFiles(merged, root, options = {}) {
  const index = isPlainObject(merged?.assetIndex) ? merged.assetIndex : null;
  if (!index?.id || !index.url) return { total: 0, missing: 0, downloaded: 0 };

  const safeId = safeVersionId(index.id);
  if (!safeId) return { total: 0, missing: 0, downloaded: 0 };
  const indexesDirectory = path.join(root, 'assets', 'indexes');
  const indexPath = path.join(indexesDirectory, `${safeId}.json`);
  const existing = findAssetIndex(root, index, options.versionIds || []);
  let data = existing?.data || null;

  if (!isPlainObject(data)) {
    emitInstanceProgress(options.id, 'assets', 'Descargando el índice de recursos…', 35);
    await downloadFile(index.url, indexPath, {
      signal: options.signal,
      allowedDomains: ['mojang.com', 'minecraft.net'],
      maxBytes: 64 * 1024 * 1024,
      sha1: index.sha1,
      onProgress: (progress) => emitInstanceProgress(options.id, 'assets', 'Descargando el índice de recursos…', progress.percent)
    });
    data = readJson(indexPath, null);
    if (!isPlainObject(data)) throw new Error('El índice de recursos descargado no es válido.');
  }

  const { total, missing } = missingAssetsFor(root, data);
  if (!missing.length) return { total, missing: 0, downloaded: 0 };

  let downloaded = 0;
  let cursor = 0;
  const worker = async () => {
    while (cursor < missing.length) {
      if (options.signal?.aborted) throw abortError();
      const object = missing[cursor++];
      const destination = path.join(root, 'assets', 'objects', object.hash.slice(0, 2), object.hash);
      await downloadFile(`https://resources.download.minecraft.net/${object.hash.slice(0, 2)}/${object.hash}`, destination, {
        signal: options.signal,
        allowedDomains: ['minecraft.net'],
        maxBytes: MAX_ASSET_BYTES,
        sha1: object.hash
      });
      downloaded++;
      if (downloaded % 10 === 0 || downloaded === missing.length) {
        emitInstanceProgress(
          options.id,
          'assets',
          `Descargando recursos (${downloaded}/${missing.length})…`,
          40 + Math.round((downloaded / missing.length) * 55)
        );
      }
    }
  };

  const workers = Array.from({ length: Math.min(6, missing.length) }, () => worker());
  await Promise.all(workers);
  return { total, missing: missing.length, downloaded };
}

function verifyInstanceFiles(instance) {
  const root = path.resolve(instance.gameRoot);
  const issues = [];
  const summary = {
    version: { id: instance.version || '', json: false, jar: false },
    loader: { id: instance.loader || 'vanilla', expected: '', installed: false },
    libraries: { total: 0, missing: 0 },
    assets: { index: false, total: 0, missing: 0 }
  };

  if (!instance.version) {
    issues.push({ code: 'version-missing', severity: 'error', message: 'La instancia no tiene una versión de Minecraft asignada.' });
    return { issues, summary };
  }

  const jsonPath = path.join(root, 'versions', instance.version, `${instance.version}.json`);
  const jarPath = path.join(root, 'versions', instance.version, `${instance.version}.jar`);
  summary.version.json = fs.existsSync(jsonPath);
  summary.version.jar = fs.existsSync(jarPath) && fs.statSync(jarPath).size > 0;
  if (!summary.version.json) {
    issues.push({ code: 'base-json', severity: 'error', message: `Falta el perfil de Minecraft ${instance.version}.` });
  }
  if (!summary.version.jar) {
    issues.push({ code: 'base-jar', severity: 'error', message: `Falta el cliente de Minecraft ${instance.version}.` });
  }

  let launchId = instance.version;
  if (instance.loader && instance.loader !== 'vanilla') {
    const expected = loaderVersionId(instance.loader, instance.version, instance.loaderVersion);
    summary.loader.expected = expected || '';
    if (!instance.loaderVersion) {
      issues.push({ code: 'loader-version', severity: 'error', message: `Falta la versión de ${LOADER_LABELS[instance.loader] || instance.loader}.` });
    } else if (!expected || !versionInstalled(expected, root)) {
      const found = findInstalledLoaderVersion(instance.version, expected, root);
      summary.loader.installed = Boolean(found);
      if (!found) {
        issues.push({
          code: 'loader',
          severity: 'error',
          message: `Falta ${LOADER_LABELS[instance.loader] || instance.loader} ${instance.loaderVersion} para Minecraft ${instance.version}.`
        });
      } else {
        launchId = found;
      }
    } else {
      summary.loader.installed = true;
      launchId = expected;
    }
  }

  const { chain, error } = loadVersionChain(launchId, root);
  if (error) {
    issues.push({ code: 'version-chain', severity: 'error', message: error });
    return { issues, summary };
  }

  const { merged } = mergeVersionChain(chain);
  const libraries = (Array.isArray(merged.libraries) ? merged.libraries : [])
    .filter((library) => isPlainObject(library) && library.downloads?.artifact?.path);
  let missingLibraries = 0;
  for (const library of libraries) {
    const file = path.join(root, 'libraries', library.downloads.artifact.path);
    try {
      const stat = fs.statSync(file);
      if (!stat.isFile() || !stat.size) missingLibraries++;
    } catch {
      missingLibraries++;
    }
  }
  summary.libraries = { total: libraries.length, missing: missingLibraries };
  if (missingLibraries) {
    issues.push({
      code: 'libraries',
      severity: 'error',
      message: `Faltan ${missingLibraries} librería${missingLibraries === 1 ? '' : 's'} de Minecraft o del cargador.`
    });
  }

  const assetIndex = isPlainObject(merged.assetIndex) ? merged.assetIndex : null;
  if (assetIndex?.id) {
    const versionIds = [instance.version, launchId, ...chain.map((entry) => entry.id)];
    const indexData = findAssetIndex(root, assetIndex, versionIds)?.data || null;
    summary.assets.index = isPlainObject(indexData);
    if (!isPlainObject(indexData)) {
      issues.push({ code: 'assets-index', severity: 'error', message: 'Falta el índice de recursos del juego.' });
    } else {
      const { total, missing } = missingAssetsFor(root, indexData);
      summary.assets.total = total;
      summary.assets.missing = missing.length;
      if (missing.length) {
        issues.push({
          code: 'assets',
          severity: 'error',
          message: `Faltan ${missing.length} recurso${missing.length === 1 ? '' : 's'} del juego.`
        });
      }
    }
  }

  return { issues, summary };
}

async function repairInstanceFiles(instance, options = {}) {
  const root = path.resolve(instance.gameRoot);
  if (!instance.version) throw new Error('Asigna una versión de Minecraft a la instancia antes de reparar.');
  const notify = (message, percent) => emitInstanceProgress(instance.id, 'repair', message, percent);
  const launchSettings = effectiveInstanceSettings(instance);

  notify(`Comprobando Minecraft ${instance.version}…`, 5);
  await ensureBaseVersionInstalled(instance.version, {
    gameRoot: root,
    signal: options.signal,
    notify
  });

  if (instance.loader && instance.loader !== 'vanilla') {
    let loaderVersion = instance.loaderVersion;
    if (!loaderVersion) {
      notify(`Buscando una versión de ${LOADER_LABELS[instance.loader] || instance.loader}…`, 15);
      const resolved = await resolveLoaderVersion(instance.loader, instance.version, null, { gameRoot: root, signal: options.signal });
      loaderVersion = resolved.version;
      instance.loaderVersion = loaderVersion;
      saveSettings();
    }
    notify(`Comprobando ${LOADER_LABELS[instance.loader] || instance.loader} ${loaderVersion}…`, 20);
    await ensureLoaderInstalled(instance.loader, instance.version, loaderVersion, {
      gameRoot: root,
      signal: options.signal,
      javaPath: launchSettings.javaPath,
      javaOverride: typeof launchSettings.overrides?.javaPath === 'string',
      notify
    });
  }

  const expected = instance.loader && instance.loader !== 'vanilla'
    ? loaderVersionId(instance.loader, instance.version, instance.loaderVersion)
    : instance.version;
  const launchId = expected && versionInstalled(expected, root)
    ? expected
    : findInstalledLoaderVersion(instance.version, expected, root) || instance.version;
  const { chain, error } = loadVersionChain(launchId, root);
  if (error) throw new Error(error);
  const { merged } = mergeVersionChain(chain);

  notify('Comprobando librerías…', 30);
  await ensureLaunchLibraries(merged.libraries, root, options.signal);
  await ensureAssetFiles(merged, root, {
    id: instance.id,
    signal: options.signal,
    versionIds: [instance.version, launchId, ...chain.map((entry) => entry.id)]
  });
  emitInstanceProgress(instance.id, 'done', 'Archivos reparados.', 100);
  return { instance: await instanceDetails(instance) };
}

/* -------------------------------------------------------------------------- */
/*                                  Logs                                      */
/* -------------------------------------------------------------------------- */

function timestamp() {
  return new Date().toLocaleTimeString('es-ES', { hour12: false });
}

function pushLog(level, message) {
  if (!currentLaunch) return;
  const lines = sanitizeLogLine(message).split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean);
  for (const line of lines) {
    currentLaunch.logs.push(`[${timestamp()}] ${line}`);
    console.log(line);
  }
  if (currentLaunch.logs.length > 5000) currentLaunch.logs.splice(0, currentLaunch.logs.length - 5000);
  sendToRenderer('launch:event', { type: 'log', level, message: lines.join('\n') });
}

function writeLaunchLog() {
  if (!currentLaunch) return;
  try {
    const directory = gamePaths().logs;
    ensureDir(directory);
    const header = [
      'NexyLauncher 1.0 — registro de lanzamiento',
      `Fecha: ${new Date().toISOString()}`,
      `Versión: ${currentLaunch.version}`,
      `Jugador: ${currentLaunch.accountName || '—'}`,
      '------------------------------------------------------------'
    ];
    fs.promises.writeFile(path.join(directory, 'nexy-launcher-last.log'), `${header.join('\n')}\n${currentLaunch.logs.join('\n')}\n`, 'utf8').catch(() => {});
  } catch {
    /* noop */
  }
}

/* -------------------------------------------------------------------------- */
/*                                 Lanzamiento                                */
/* -------------------------------------------------------------------------- */

function emitStatus(status, message, extra = {}) {
  if (currentLaunch) {
    currentLaunch.phase = status;
    if (status === 'running') currentLaunch.started = true;
  }
  sendToRenderer('launch:event', { type: 'status', status, message, ...extra });
}

function usesLegacyNatives(version) {
  const match = /^1\.(\d+)/.exec(String(version || ''));
  return match ? Number(match[1]) < 19 : false;
}

async function performLaunch({ version, type, account, server }) {
  try {
    emitStatus('checking', 'Comprobando Java y archivos del juego…');
    const { gameRoot } = gamePaths();
    const instance = activeInstance();
    const launchSettings = effectiveInstanceSettings(instance);
    if (instance) {
      instance.lastPlayedAt = new Date().toISOString();
      saveSettings();
    }
    const prepared = prepareLaunchVersion(version);
    if (prepared.modded && prepared.libraries?.length) {
      emitStatus('downloading', `Comprobando las librerías de ${prepared.loader}…`);
      const checked = await ensureLaunchLibraries(prepared.libraries, gameRoot, currentLaunch?.controller?.signal);
      pushLog('info', `Librerías de ${prepared.loader} verificadas (${checked}).`);
    }
    const javaVersion = prepared.modded && prepared.base ? prepared.base : version;
    const java = await resolveJavaFor(javaVersion, {
      javaPath: launchSettings.javaPath,
      javaOverride: typeof launchSettings.overrides?.javaPath === 'string'
    });
    pushLog('info', `Java ${java.info?.version || ''} ${java.info?.vendor ? `(${java.info.vendor})` : ''} · ${java.info?.path || java.path || 'java (PATH)'}`);
    pushLog('info', `Memoria asignada: ${launchSettings.memory.min} GB – ${launchSettings.memory.max} GB${instance?.settings?.memory ? ' (instancia)' : ''}`);
    pushLog('info', `Instancia: ${instance?.name || 'Principal'} · ${gameRoot}`);
    if (!java.automatic && java.info) {
      pushLog('info', 'Usando la ruta de Java elegida manualmente.');
    }

    if (prepared.modded) {
      pushLog('info', `Versión modificada detectada: ${prepared.loader}${prepared.loaderVersion ? ` ${prepared.loaderVersion}` : ''} (base ${prepared.base}).`);
      pushLog('info', `Cliente: ${path.basename(prepared.minecraftJar)} · argumentos de ${prepared.loader}.`);
    }

    const nativeBase = prepared.modded ? prepared.base : version;
    if (usesLegacyNatives(nativeBase)) {
      const nativeDirectory = path.join(gameRoot, 'natives', version);
      try {
        fs.rmSync(nativeDirectory, { recursive: true, force: true });
      } catch (error) {
        pushLog('warn', `No se pudieron limpiar las librerías nativas: ${humanError(error)}`);
      }
    }

    const launchOptions = {
      authorization: offlineAuthorization(account.name),
      root: gameRoot,
      version: { number: version, type },
      memory: { max: `${launchSettings.memory.max}G`, min: `${launchSettings.memory.min}G` },
      window: {
        width: launchSettings.resolution.width,
        height: launchSettings.resolution.height,
        fullscreen: launchSettings.resolution.fullscreen
      },
      customArgs: [...splitArguments(launchSettings.jvmArgs), ...prepared.extraJvmArgs],
      customLaunchArgs: splitArguments(launchSettings.gameArgs),
      javaPath: java.path || undefined,
      timeout: 60000
    };

    if (prepared.modded) {
      launchOptions.overrides = {
        versionJson: prepared.versionJson,
        minecraftJar: prepared.minecraftJar
      };
    }

    if (server) {
      pushLog('info', `Conexión rápida a ${server}`);
      if (supportsQuickPlay(version)) {
        launchOptions.quickPlay = { type: 'multiplayer', identifier: server };
      } else {
        const [host, port] = splitServerAddress(server);
        launchOptions.customLaunchArgs = [...launchOptions.customLaunchArgs, '--server', host, '--port', String(port)];
      }
    }

    emitStatus('preparing', 'Preparando Minecraft…');

    activeLauncher = new Client();
    let lastDownloadEmit = { name: '', at: 0, percent: -1 };
    let sawProgress = false;
    let closing = false;

    activeLauncher.on('debug', (message) => {
      pushLog('debug', message);
      if (/Attempting to download Minecraft version jar/i.test(String(message))) {
        emitStatus('downloading', 'Descargando el cliente de Minecraft…');
      } else if (/Attempting to download assets/i.test(String(message))) {
        emitStatus('downloading', 'Descargando recursos del juego…');
      } else if (/Using Java version/i.test(String(message))) {
        emitStatus('preparing', 'Java detectado, preparando archivos…');
      } else if (/Failed to start|Couldn't start/i.test(String(message))) {
        currentLaunch.failure = String(message);
      }
    });

    activeLauncher.on('progress', (progress) => {
      sawProgress = true;
      const label = PROGRESS_LABELS[progress.type] || 'Preparando archivos';
      const percent = progress.total ? Math.round((progress.task / progress.total) * 100) : 0;
      emitStatus('downloading', label);
      sendToRenderer('launch:event', {
        type: 'progress',
        stage: progress.type,
        label,
        task: progress.task,
        total: progress.total,
        percent
      });
    });

    activeLauncher.on('download-status', (download) => {
      const percent = download.total ? Math.min(100, Math.round((download.current / download.total) * 100)) : null;
      const now = Date.now();
      if (download.name !== lastDownloadEmit.name || now - lastDownloadEmit.at > 320 || (percent !== null && percent >= 100 && lastDownloadEmit.percent < 100)) {
        lastDownloadEmit = { name: download.name, at: now, percent: percent ?? -1 };
        const label = DOWNLOAD_LABELS[download.type] || 'Archivo';
        sendToRenderer('launch:event', {
          type: 'download',
          label,
          file: download.name,
          current: download.current,
          total: download.total,
          percent
        });
      }
    });

    activeLauncher.on('arguments', () => {
      if (currentLaunch) currentLaunch.started = true;
      emitStatus('starting', 'Iniciando Minecraft…');
      if (launchSettings.minimizeOnLaunch && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.minimize();
      }
      setTimeout(() => {
        if (currentLaunch && !closing && !currentLaunch.stopRequested && currentLaunch.phase !== 'error') {
          emitStatus('running', 'Minecraft se está ejecutando.');
        }
      }, 2500);
    });

    activeLauncher.on('data', (message) => {
      pushLog('game', message);
    });

    activeLauncher.on('close', (code) => {
      closing = true;
      activeProcess = null;
      const stopped = Boolean(currentLaunch?.stopRequested);
      const failed = !stopped && (!currentLaunch?.started || code !== 0);
      if (stopped) {
        emitStatus('closed', currentLaunch?.started ? 'Minecraft se cerró.' : 'Inicio de Minecraft cancelado.', { code: 'cancelled' });
      } else if (failed) {
        emitStatus('error', currentLaunch?.failure || `Minecraft se cerró antes de iniciarse (código ${code}). Revisa la consola para más detalles.`, { code: 'launch' });
      } else {
        emitStatus('closed', code === 0 ? 'Minecraft se cerró correctamente.' : `Minecraft se cerró (código ${code}).`, { code });
      }
      writeLaunchLog();
      if (!stopped && currentLaunch?.started && code !== 0) {
        captureCrash(code, currentLaunch?.instanceId).catch((error) => console.error('No se pudo preparar el crash para el asistente:', error));
      }
      activeLauncher = null;
      currentLaunch && (currentLaunch.running = false);
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isMinimized()) {
          mainWindow.restore();
          mainWindow.focus();
        }
      }, 500);
    });

    activeLauncher.on('error', (error) => {
      pushLog('error', humanError(error));
    });

    currentLaunch.running = true;
    emitStatus('downloading', 'Comprobando archivos del juego…');

    const gameProcess = await activeLauncher.launch(launchOptions);

    if (!gameProcess) {
      if (!closing) {
        if (currentLaunch?.stopRequested) {
          emitStatus('closed', 'Inicio de Minecraft cancelado.', { code: 'cancelled' });
        } else {
          emitStatus('error', currentLaunch?.failure || 'No se pudo iniciar Minecraft. Comprueba Java y los archivos de la versión en la consola.', { code: 'launch' });
        }
        writeLaunchLog();
      }
      activeLauncher = null;
      activeProcess = null;
      if (currentLaunch) currentLaunch.running = false;
      return;
    }

    if (closing || !currentLaunch) {
      activeLauncher = null;
      return;
    }

    activeProcess = gameProcess;

    if (cancelRequested) {
      try {
        if (gameProcess.pid) {
          if (process.platform === 'win32') {
            execFile('taskkill', ['/pid', String(gameProcess.pid), '/T', '/F'], { windowsHide: true }, () => {});
          } else {
            gameProcess.kill('SIGTERM');
          }
        }
      } catch {
        /* noop */
      }
    }
  } catch (error) {
    const message = humanError(error);
    pushLog('error', message);
    if (error?.code === 'JAVA_REQUIRED' && !currentLaunch?.stopRequested) {
      const details = error.details || { version, required: requiredJavaFor(version), detected: [] };
      sendToRenderer('launch:event', { type: 'java-required', ...details, message });
      emitStatus('error', message, { code: 'java' });
    } else if (currentLaunch?.stopRequested) {
      emitStatus('closed', 'Inicio de Minecraft cancelado.', { code: 'cancelled' });
    } else {
      emitStatus('error', message, { code: /java/i.test(message) ? 'java' : 'launch' });
    }
    writeLaunchLog();
    activeLauncher = null;
    activeProcess = null;
    if (currentLaunch) currentLaunch.running = false;
  }
}

function startLaunch({ version, server, account, loader, loaderVersion }) {
  if (currentLaunch?.running) {
    throw new Error('Minecraft ya se está ejecutando desde este launcher.');
  }

  const safeVersion = safeVersionId(version);
  if (!safeVersion) throw new Error('La versión seleccionada no es válida.');

  const requestedLoader = normalizeLoader(loader || 'vanilla');
  if (!requestedLoader) throw new Error('El cargador seleccionado no es válido.');

  const safeLoaderVersion = loaderVersion ? safeVersionId(loaderVersion) : null;
  if (loaderVersion && !safeLoaderVersion) throw new Error('La versión del cargador no es válida.');

  const safeServer = server ? normalizeAddress(server) : null;
  if (server && !safeServer) throw new Error('La dirección del servidor no es válida.');

  cancelRequested = false;
  const controller = new AbortController();
  currentLaunch = {
    version: safeVersion,
    instanceId: activeInstance()?.id || null,
    requestedLoader,
    requestedLoaderVersion: safeLoaderVersion,
    accountName: account.name,
    logs: [],
    startedAt: Date.now(),
    started: false,
    running: true,
    installing: false,
    phase: 'checking',
    stopRequested: false,
    controller
  };

  sendToRenderer('launch:event', {
    type: 'start',
    version: safeVersion,
    loader: requestedLoader,
    loaderVersion: safeLoaderVersion,
    server: safeServer || null
  });

  (async () => {
    const launchSettings = effectiveInstanceSettings(activeInstance());
    const local = await readLocalVersion(safeVersion);
    const localInfo = local ? versionLoaderInfo(safeVersion, local) : null;
    const directModded = Boolean(
      local && (typeof local.inheritsFrom === 'string' || (localInfo?.id && localInfo.id !== 'vanilla'))
    );

    const notify = (message, percent) => {
      if (currentLaunch?.stopRequested) return;
      emitStatus('installing', message);
      sendToRenderer('launch:event', {
        type: 'install',
        message,
        percent: typeof percent === 'number' ? percent : null
      });
    };

    let launchVersion = safeVersion;
    let launchType = 'release';

    if (directModded) {
      if (local?.type && local.type !== 'custom') launchType = local.type;
      const label = localInfo?.label || 'versión modificada';
      pushLog('info', `Lanzando la versión instalada ${safeVersion} (${label}${localInfo?.base ? ` · base ${localInfo.base}` : ''}).`);
      notify(`Comprobando los archivos base de ${safeVersion}…`);
      if (localInfo?.base) {
        await ensureBaseVersionInstalled(localInfo.base, {
          signal: controller.signal,
          notify: (message, percent) => notify(message, percent)
        });
      }
      sendToRenderer('launch:event', {
        type: 'resolved',
        version: launchVersion,
        loader: localInfo?.id || 'vanilla',
        loaderVersion: localInfo?.version || null,
        base: localInfo?.base || null,
        installed: true
      });
    } else if (requestedLoader === 'vanilla') {
      notify(`Comprobando Minecraft ${safeVersion}…`);
      await ensureBaseVersionInstalled(safeVersion, {
        signal: controller.signal,
        notify: (message, percent) => notify(message, percent)
      });
      sendToRenderer('launch:event', {
        type: 'resolved',
        version: launchVersion,
        loader: 'vanilla',
        loaderVersion: null,
        base: safeVersion,
        installed: true
      });
    } else {
      currentLaunch.installing = true;
      notify(`Preparando ${LOADER_LABELS[requestedLoader]} para Minecraft ${safeVersion}…`);
      const result = await ensureLoaderInstalled(requestedLoader, safeVersion, safeLoaderVersion, {
        signal: controller.signal,
        javaPath: launchSettings.javaPath,
        javaOverride: typeof launchSettings.overrides?.javaPath === 'string',
        notify: (message, percent) => notify(message, percent)
      });
      currentLaunch.installing = false;
      launchVersion = result.id;
      pushLog('info', `${LOADER_LABELS[requestedLoader]} ${result.version} listo como ${launchVersion}.`);
      sendToRenderer('launch:event', {
        type: 'resolved',
        version: launchVersion,
        loader: requestedLoader,
        loaderVersion: result.version,
        base: safeVersion,
        installed: result.installed
      });
    }

    if (currentLaunch?.stopRequested || controller.signal.aborted) throw abortError();

    await performLaunch({ version: launchVersion, type: launchType, account, server: safeServer });
  })().catch((error) => {
    const message = humanError(error);
    if (currentLaunch?.stopRequested || controller.signal.aborted || error.name === 'AbortError') {
      pushLog('info', 'Inicio de Minecraft cancelado.');
      emitStatus('closed', 'Inicio de Minecraft cancelado.', { code: 'cancelled' });
      if (currentLaunch) {
        currentLaunch.running = false;
        currentLaunch.installing = false;
      }
      writeLaunchLog();
      return;
    }
    if (error?.code === 'JAVA_REQUIRED') {
      pushLog('error', message);
      const details = error.details || { version: safeVersion, required: requiredJavaFor(safeVersion), detected: [] };
      sendToRenderer('launch:event', { type: 'java-required', ...details, message });
      emitStatus('error', message, { code: 'java' });
      writeLaunchLog();
      if (currentLaunch) {
        currentLaunch.running = false;
        currentLaunch.installing = false;
      }
      return;
    }
    pushLog('error', message);
    emitStatus('error', message, { code: 'launch' });
    writeLaunchLog();
    if (currentLaunch) {
      currentLaunch.running = false;
      currentLaunch.installing = false;
    }
  });

  return { ok: true };
}

function stopLaunch() {
  const pendingInstall = Boolean(activeInstaller || activeDownloadController || currentLaunch?.installing);

  if (!activeProcess && !currentLaunch?.running && !pendingInstall) {
    return { ok: false, message: 'No hay ningún juego en ejecución.' };
  }

  if (currentLaunch) currentLaunch.stopRequested = true;
  cancelRequested = true;

  if (activeDownloadController) {
    try {
      activeDownloadController.abort();
    } catch {
      /* noop */
    }
  }

  if (activeInstaller) {
    pushLog('info', 'Cancelando el instalador del cargador…');
    try {
      activeInstaller.kill();
    } catch {
      /* noop */
    }
  }

  if (!activeProcess) {
    emitStatus('stopping', 'Cancelando el inicio de Minecraft…');
    pushLog('info', 'Cancelación solicitada. El inicio se detendrá en cuanto sea posible.');
    return { ok: true, pending: true };
  }

  pushLog('info', 'Solicitud de cierre enviada a Minecraft.');
  emitStatus('stopping', 'Deteniendo Minecraft…');

  try {
    if (process.platform === 'win32' && activeProcess.pid) {
      execFile('taskkill', ['/pid', String(activeProcess.pid), '/T', '/F'], { windowsHide: true }, (error) => {
        if (error) pushLog('error', `No se pudo cerrar Minecraft: ${humanError(error)}`);
      });
    } else {
      activeProcess.kill('SIGTERM');
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, message: humanError(error) };
  }
}

/* -------------------------------------------------------------------------- */
/*                                   IPC                                      */
/* -------------------------------------------------------------------------- */

function handle(channel, callback) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await callback(...args);
    } catch (error) {
      console.error(`[IPC ${channel}]`, error);
      throw new Error(humanError(error));
    }
  });
}

const CRASH_RULES = [
  {
    id: 'memory',
    severity: 'high',
    test: /OutOfMemoryError|Java heap space|GC overhead limit exceeded/i,
    title: 'Memoria insuficiente',
    detail: 'Minecraft se quedó sin memoria asignada durante la partida o al cargar mods.',
    suggestion: 'Aumenta la RAM máxima de la instancia en Ajustes y cierra otras aplicaciones pesadas.'
  },
  {
    id: 'java-version',
    severity: 'high',
    test: /UnsupportedClassVersionError|class file version \d+/i,
    title: 'Versión de Java incompatible',
    detail: 'El mod o la versión de Minecraft necesita una versión de Java más reciente que la seleccionada.',
    suggestion: 'Selecciona Java 17 o 21 en los ajustes de la instancia y vuelve a intentarlo.'
  },
  {
    id: 'dependencies',
    severity: 'high',
    test: /ModResolutionException|Incompatible mod set|Missing or unsupported mandatory dependencies|requires .+ which is missing|Depends on .+ which is missing/i,
    title: 'Dependencias de mods sin resolver',
    detail: 'Falta un mod obligatorio o hay versiones incompatibles entre sí.',
    suggestion: 'Abre el detalle de la instancia, revisa los mods instalados y añade las dependencias que falten.'
  },
  {
    id: 'duplicate-mods',
    severity: 'high',
    test: /DuplicateModsFoundException|Found duplicate mods?|duplicate mod file/i,
    title: 'Mods duplicados',
    detail: 'Hay dos archivos distintos que declaran el mismo mod.',
    suggestion: 'En la página Mods, usa el desplegable de versiones para dejar activa una sola copia.'
  },
  {
    id: 'mixin',
    severity: 'high',
    test: /Mixin apply failed|InvalidMixinException|MixinTransformerError|mixin\.injection\.throwables/i,
    title: 'Conflicto de Mixin entre mods',
    detail: 'Dos mods intentan modificar la misma parte del juego o uno no es compatible con esta versión.',
    suggestion: 'Desactiva el mod que aparece en la línea del error y comprueba si tiene una versión para tu versión de Minecraft.'
  },
  {
    id: 'mod-incompatible',
    severity: 'high',
    test: /NoSuchMethodError|NoSuchFieldError|AbstractMethodError|IncompatibleClassChangeError|NoClassDefFoundError/i,
    title: 'Mod incompatible',
    detail: 'Un mod fue compilado para otra versión de Minecraft o de su cargador.',
    suggestion: 'Actualiza o elimina el mod señalado. Comprueba que coincide con la versión y el cargador de la instancia.'
  },
  {
    id: 'class-missing',
    severity: 'medium',
    test: /ClassNotFoundException|Could not find or load main class/i,
    title: 'Clase o librería no encontrada',
    detail: 'Falta una librería, una dependencia o el archivo principal de la versión está dañado.',
    suggestion: 'Verifica y repara la instancia desde su menú. Si persiste, revisa las dependencias de los mods.'
  },
  {
    id: 'graphics',
    severity: 'medium',
    test: /Pixel format not accelerated|GLFW error|Failed to create window|EXCEPTION_ACCESS_VIOLATION|OpenGL|WGL/i,
    title: 'Problema gráfico',
    detail: 'El driver de la tarjeta gráfica o un mod de renderizado provocó el cierre.',
    suggestion: 'Actualiza los drivers de tu GPU. Si usas shaders o mods de rendimiento, pruébalos desactivados.'
  },
  {
    id: 'permissions',
    severity: 'medium',
    test: /AccessDeniedException|FileSystemException|The process cannot access the file|Permission denied/i,
    title: 'Acceso denegado a archivos',
    detail: 'Otro programa (antivirus, sincronización o el propio juego) bloquea un archivo de la instancia.',
    suggestion: 'Cierra el juego y el launcher, y añade la carpeta del juego como excepción en tu antivirus.'
  },
  {
    id: 'network',
    severity: 'low',
    test: /UnknownHostException|ConnectException|Connection refused|SocketException|Failed to connect to/i,
    title: 'Error de conexión',
    detail: 'No se pudo contactar con el servidor o con el servicio de descargas.',
    suggestion: 'Comprueba tu conexión y que la dirección del servidor sea correcta. Vuelve a intentarlo más tarde.'
  },
  {
    id: 'corrupt',
    severity: 'medium',
    test: /Invalid or corrupt jarfile|Failed to download|Unable to access|checksum mismatch|Invalid mod file/i,
    title: 'Archivo dañado o descarga incompleta',
    detail: 'Un JAR o un archivo de la versión está incompleto o corrupto.',
    suggestion: 'Usa Verificar y reparar en el detalle de la instancia y vuelve a descargar el mod afectado.'
  },
  {
    id: 'jvm-args',
    severity: 'medium',
    test: /Unrecognized VM option|Unrecognized option:|Error: Could not create the Java Virtual Machine/i,
    title: 'Argumentos de Java no válidos',
    detail: 'Los argumentos JVM personalizados no son compatibles con esta versión de Java.',
    suggestion: 'Revisa los argumentos JVM de la instancia y elimina los que no reconozca tu versión de Java.'
  },
  {
    id: 'world',
    severity: 'medium',
    test: /Failed to load (?:world|chunk)|Chunk file at|Region file .* is missing|corrupt chunk/i,
    title: 'Mundo dañado',
    detail: 'Un chunk o una región del mundo no se pudo leer.',
    suggestion: 'Restaura una copia de seguridad del mundo desde la página Contenido.'
  }
];

async function readTailText(file, maxBytes = 512 * 1024) {
  const stat = await fs.promises.stat(file);
  if (!stat.isFile() || stat.size === 0) return '';
  const start = Math.max(0, stat.size - maxBytes);
  const length = stat.size - start;
  const buffer = Buffer.alloc(length);
  const handle = await fs.promises.open(file, 'r');
  try {
    await handle.read(buffer, 0, length, start);
  } finally {
    await handle.close();
  }
  return buffer.toString('utf8');
}

async function newestCrashReport(directory) {
  let entries;
  try {
    entries = await fs.promises.readdir(directory, { withFileTypes: true });
  } catch {
    return null;
  }
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/\.txt$/i.test(entry.name)) continue;
    const full = path.join(directory, entry.name);
    try {
      const stat = await fs.promises.stat(full);
      files.push({ file: entry.name, path: full, size: stat.size, modified: stat.mtime.toISOString(), mtime: stat.mtimeMs });
    } catch {
      /* archivo eliminado */
    }
  }
  files.sort((a, b) => b.mtime - a.mtime);
  return files[0] || null;
}

function firstMatchingLine(text, pattern) {
  const lines = text.split(/\r?\n/);
  const line = lines.find((item) => pattern.test(item));
  return line ? truncateText(line.trim(), 260) : '';
}

async function analyzeCrashLogs(id) {
  const instance = settings.instances.find((item) => item.id === id) || activeInstance();
  if (!instance) throw new Error('La instancia no existe.');
  const root = path.resolve(instance.gameRoot);
  const logsDirectory = path.join(root, 'logs');
  const crashDirectory = path.join(root, 'crash-reports');

  const sources = [];
  let latestText = '';
  const latestPath = path.join(logsDirectory, 'latest.log');
  if (fs.existsSync(latestPath)) {
    try {
      latestText = await readTailText(latestPath, 768 * 1024);
      const stat = await fs.promises.stat(latestPath);
      sources.push({ kind: 'latest.log', file: 'latest.log', size: stat.size, modified: stat.mtime.toISOString() });
    } catch {
      /* log ilegible */
    }
  }

  const report = await newestCrashReport(crashDirectory);
  let reportText = '';
  if (report) {
    try {
      reportText = await readTailText(report.path, 512 * 1024);
      sources.push({ kind: 'crash-report', file: report.file, size: report.size, modified: report.modified });
    } catch {
      /* informe ilegible */
    }
  }

  const combined = `${reportText}\n${latestText}`;
  const issues = [];
  for (const rule of CRASH_RULES) {
    if (!rule.test.test(combined)) continue;
    issues.push({
      id: rule.id,
      severity: rule.severity,
      title: rule.title,
      detail: rule.detail,
      suggestion: rule.suggestion,
      line: firstMatchingLine(combined, rule.test)
    });
  }

  const descriptionMatch = /^Description:\s*(.+)$/m.exec(reportText);
  const suspectedMatch = /^Suspected Mods?:\s*(.+)$/m.exec(reportText);
  const modSections = [...reportText.matchAll(/^-- Mod (\S+) --$/gm)].map((match) => match[1]).slice(0, 8);

  if (!issues.length && (reportText || /Exception in thread "main"|---- Minecraft Crash Report ----/i.test(latestText))) {
    issues.push({
      id: 'generic',
      severity: 'medium',
      title: 'Se detectó un cierre inesperado',
      detail: 'No coincide con un patrón conocido, pero los registros contienen un crash.',
      suggestion: 'Revisa el final del informe, desactiva los últimos mods añadidos y vuelve a probar.',
      line: firstMatchingLine(combined, /Exception in thread "main"|---- Minecraft Crash Report ----/i)
    });
  }

  const order = { high: 0, medium: 1, low: 2 };
  issues.sort((a, b) => order[a.severity] - order[b.severity]);

  const excerptSource = reportText || latestText;
  const excerpt = excerptSource
    ? excerptSource.split(/\r?\n/).slice(-120).join('\n').slice(-7000)
    : '';

  return {
    instance: instance.name,
    found: issues.length > 0,
    severity: issues[0]?.severity || 'none',
    issues,
    sources,
    description: descriptionMatch ? truncateText(descriptionMatch[1], 300) : '',
    suspectedMods: suspectedMatch ? truncateText(suspectedMatch[1], 300) : '',
    modSections,
    excerpt
  };
}

/* -------------------------------------------------------------------------- */
/*                             Asistente de IA                                */
/* -------------------------------------------------------------------------- */

const AI_ACTION_TYPES = new Set([
  'disable_mod',
  'enable_mod',
  'remove_mod',
  'set_memory',
  'set_jvm_args',
  'set_java_path',
  'repair_instance'
]);

const AI_MAX_CONTEXT_CHARS = 24000;
const AI_MAX_LOG_CHARS = 48000;

let pendingCrash = null;

function publicCrash(crash) {
  if (!crash) return null;
  return {
    id: crash.id,
    at: crash.at,
    code: crash.code,
    instanceId: crash.instanceId,
    instanceName: crash.instanceName,
    version: crash.version,
    loader: crash.loader,
    analysis: crash.analysis,
    sources: crash.sources,
    logChars: crash.logChars,
    preview: crash.preview
  };
}

function normalizeAiMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((message) => isPlainObject(message) && ['user', 'assistant'].includes(message.role))
    .map((message) => ({
      role: message.role,
      content: String(message.content || '').trim().slice(0, 8000)
    }))
    .filter((message) => message.content)
    .slice(-20);
}

function normalizeAiActions(actions) {
  if (!Array.isArray(actions)) return [];
  return actions
    .filter((action) => isPlainObject(action) && AI_ACTION_TYPES.has(String(action.type || '')))
    .slice(0, 10)
    .map((action) => ({ ...action, type: String(action.type) }));
}

function parseAiReply(text) {
  const raw = String(text || '').trim();
  if (!raw) return { reply: '', actions: [] };
  const candidates = [raw];
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  if (fenced) candidates.push(fenced[1].trim());
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first !== -1 && last > first) candidates.push(raw.slice(first, last + 1));
  for (const candidate of candidates) {
    try {
      const data = JSON.parse(candidate);
      if (isPlainObject(data) && typeof data.reply === 'string') {
        return { reply: data.reply.trim(), actions: normalizeAiActions(data.actions) };
      }
    } catch {
      /* siguiente candidato */
    }
  }
  return { reply: raw, actions: [] };
}

async function buildLauncherContext() {
  const instance = activeInstance();
  const paths = gamePaths();
  const mods = await listMods().catch(() => []);
  const localVersions = await listLocalVersions().catch(() => []);
  const worlds = await listWorlds().catch(() => []);
  const effective = instance ? effectiveInstanceSettings(instance) : null;

  const context = {
    launcher: {
      nombre: 'NexyLauncher 1.0',
      version: app.getVersion(),
      sistema: process.platform,
      electron: process.versions.electron
    },
    instanciaActiva: instance
      ? {
          nombre: instance.name,
          version: instance.version || null,
          cargador: instance.loader || 'vanilla',
          versionCargador: instance.loaderVersion || null,
          descripcion: instance.description || '',
          carpeta: paths.gameRoot,
          memoria: effective?.memory || settings.memory,
          resolucion: effective?.resolution || settings.resolution,
          java: effective?.javaPath || 'automático',
          argumentosJVM: effective?.jvmArgs || '',
          argumentosJuego: effective?.gameArgs || ''
        }
      : null,
    instancias: (settings.instances || []).map((item) => ({
      nombre: item.name,
      version: item.version || null,
      cargador: item.loader || 'vanilla',
      versionCargador: item.loaderVersion || null
    })),
    mods: mods.map((mod) => ({
      archivo: mod.file,
      activo: mod.enabled,
      nombre: mod.name || null,
      version: mod.versionNumber || null,
      proyecto: mod.projectId || null
    })),
    versionesLocales: localVersions.map((version) => ({
      id: version.id,
      tipo: version.type,
      cargador: version.loader || null,
      base: version.base || null
    })),
    mundos: worlds.map((world) => ({ nombre: world.name, tamano: world.size, modificado: world.modified })),
    servidores: (servers || []).map((server) => ({ nombre: server.name, direccion: server.address })),
    ajustes: {
      memoria: settings.memory,
      resolucion: settings.resolution,
      java: settings.javaPath || 'automático',
      argumentosJVM: settings.jvmArgs || '',
      argumentosJuego: settings.gameArgs || '',
      proveedorMods: settings.modProvider,
      ultimaVersion: settings.lastVersion || null,
      ultimoCargador: settings.lastLoader || 'vanilla'
    },
    crashPendiente: pendingCrash
      ? {
          instancia: pendingCrash.instanceName,
          codigo: pendingCrash.code,
          diagnostico: pendingCrash.analysis
        }
      : null
  };

  let json = JSON.stringify(context, null, 2);
  if (json.length > AI_MAX_CONTEXT_CHARS) json = `${json.slice(0, AI_MAX_CONTEXT_CHARS)}\n… (contexto recortado)`;
  return json;
}

function buildAiSystemPrompt(contextJson, crash) {
  const lines = [
    'Eres el asistente integrado de NexyLauncher 1.0, un launcher de Minecraft Java Edition para cuentas offline.',
    'Ayudas a resolver dudas sobre el launcher, versiones, cargadores (Vanilla, Fabric, Forge, NeoForge, Quilt), mods, Java, memoria, servidores y crashes.',
    'Responde siempre en español, de forma clara, directa y sin inventar datos. Si falta información, pídela.',
    '',
    'Formato obligatorio: devuelve SOLO un objeto JSON válido, sin texto fuera del JSON, con esta forma:',
    '{"reply":"tu respuesta en texto", "actions":[{"type":"disable_mod","file":"nombre.jar"}]}',
    'Si no propones cambios, usa "actions": [].',
    '',
    'Acciones permitidas (solo si estás razonablemente seguro y el archivo existe en el contexto):',
    '- disable_mod: {"type":"disable_mod","file":"mod.jar"} (renombra a .disabled)',
    '- enable_mod: {"type":"enable_mod","file":"mod.jar.disabled"}',
    '- remove_mod: {"type":"remove_mod","file":"mod.jar"} (borra el archivo; úsalo solo como último recurso)',
    '- set_memory: {"type":"set_memory","min":2,"max":6} en GB',
    '- set_jvm_args: {"type":"set_jvm_args","value":"-XX:+UseG1GC"}',
    '- set_java_path: {"type":"set_java_path","value":"C:\\\\ruta\\\\java.exe"} (solo rutas reales del contexto)',
    '- repair_instance: {"type":"repair_instance"} para descargar archivos faltantes de la instancia',
    '',
    'Reglas de seguridad:',
    '- Nunca propongas borrar mundos, cuentas ni la instancia.',
    '- Para conflictos de mods, prefiere disable_mod antes que remove_mod.',
    '- No propongas acciones si el problema es de red, credenciales o algo que no puedas cambiar.',
    '- Explica brevemente qué hace cada acción en "reply".',
    '',
    'Contexto actual del launcher (JSON):',
    contextJson
  ];
  if (crash) {
    const log = String(crash.logText || '').slice(-AI_MAX_LOG_CHARS);
    const report = String(crash.reportText || '').slice(-AI_MAX_LOG_CHARS);
    lines.push(
      '',
      'El usuario ha autorizado expresamente que leas el registro del último crash.',
      report ? `Informe de crash:\n${report}` : '',
      log ? `Últimas líneas de latest.log:\n${log}` : ''
    );
  }
  return lines.filter(Boolean).join('\n');
}

async function aiFetchJson(url, options = {}, timeoutMs = 120000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!response.ok) {
      const detail = data?.error?.message || data?.message || text.slice(0, 300) || `HTTP ${response.status}`;
      throw new Error(`El proveedor de IA respondió ${response.status}: ${detail}`);
    }
    return data;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('El proveedor de IA tardó demasiado en responder.');
    if (error instanceof TypeError) throw new Error(`No se pudo conectar con el proveedor de IA: ${humanError(error)}`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function aiChat(payload = {}) {
  const data = isPlainObject(payload) ? payload : {};
  if (!settings.aiApiKey) throw new Error('Configura tu API key del asistente en Ajustes → Asistente de IA.');
  const model = String(settings.aiModel || 'gpt-4o-mini').trim();
  const base = sanitizeAiBaseUrl(settings.aiBaseUrl);
  const messages = normalizeAiMessages(data.messages);
  if (!messages.length) throw new Error('Escribe un mensaje para el asistente.');

  const includeContext = data.includeContext !== false;
  const contextJson = includeContext ? await buildLauncherContext() : '{}';
  const crash = data.crashId && pendingCrash?.id === String(data.crashId) ? pendingCrash : null;
  const system = buildAiSystemPrompt(contextJson, crash);

  const result = await aiFetchJson(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.aiApiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, ...messages],
      temperature: 0.2,
      max_tokens: 1600
    })
  });

  const content = result?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('El proveedor de IA devolvió una respuesta vacía.');
  const parsed = parseAiReply(content);
  return {
    reply: parsed.reply || 'No he podido generar una respuesta.',
    actions: parsed.actions,
    model,
    usage: result?.usage || null,
    contextIncluded: includeContext,
    crashIncluded: Boolean(crash)
  };
}

async function aiTest() {
  if (!settings.aiApiKey) throw new Error('Escribe primero tu API key del asistente.');
  const base = sanitizeAiBaseUrl(settings.aiBaseUrl);
  const model = String(settings.aiModel || 'gpt-4o-mini').trim();
  const result = await aiFetchJson(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.aiApiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'Responde solo con la palabra OK.' }],
      max_tokens: 8,
      temperature: 0
    })
  }, 45000);
  const reply = result?.choices?.[0]?.message?.content;
  if (typeof reply !== 'string') throw new Error('El proveedor no devolvió una respuesta válida.');
  return { ok: true, model, reply: reply.trim().slice(0, 80) };
}

async function captureCrash(code, instanceId = null) {
  const instance = (instanceId && settings.instances.find((item) => item.id === instanceId)) || activeInstance();
  if (!instance) return;
  const analysis = await analyzeCrashLogs(instance.id).catch(() => null);

  let logText = '';
  const latestPath = path.join(instance.gameRoot, 'logs', 'latest.log');
  try {
    if (fs.existsSync(latestPath)) logText = await readTailText(latestPath, 512 * 1024);
  } catch {
    /* log ilegible */
  }

  let reportText = '';
  const report = await newestCrashReport(path.join(instance.gameRoot, 'crash-reports'));
  try {
    if (report) reportText = await readTailText(report.path, 512 * 1024);
  } catch {
    /* informe ilegible */
  }

  const previewSource = reportText || logText;
  pendingCrash = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    code,
    instanceId: instance.id,
    instanceName: instance.name,
    version: instance.version || '',
    loader: instance.loader || 'vanilla',
    analysis: analysis
      ? {
          found: analysis.found,
          severity: analysis.severity,
          description: analysis.description,
          suspectedMods: analysis.suspectedMods,
          issues: (analysis.issues || []).slice(0, 6),
          excerpt: String(analysis.excerpt || '').slice(-3000)
        }
      : null,
    sources: analysis?.sources || [],
    logChars: logText.length,
    preview: previewSource.split(/\r?\n/).slice(-24).join('\n').slice(-2500),
    logText,
    reportText
  };

  sendToRenderer('launch:event', { type: 'crash', crash: publicCrash(pendingCrash) });
}

async function readCrashForAi(id) {
  if (!pendingCrash || pendingCrash.id !== String(id || '')) throw new Error('El crash ya no está disponible.');
  return {
    available: true,
    crash: publicCrash(pendingCrash),
    logChars: pendingCrash.logChars,
    hasReport: Boolean(pendingCrash.reportText)
  };
}

function aiBackupsRoot() {
  return path.join(gamePaths().gameRoot, '.nexy', 'ai-backups');
}

async function createAiBackup(actions) {
  const root = aiBackupsRoot();
  const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID().slice(0, 6)}`;
  const directory = path.join(root, id);
  ensureDir(directory);

  const mods = gamePaths().mods;
  if (fs.existsSync(mods)) {
    await fs.promises.cp(mods, path.join(directory, 'mods'), { recursive: true });
  }
  if (fs.existsSync(FILES.settings)) {
    const safeSettings = { ...settings };
    delete safeSettings.aiApiKey;
    delete safeSettings.curseforgeApiKey;
    await fs.promises.writeFile(path.join(directory, 'settings.json'), JSON.stringify(safeSettings, null, 2), 'utf8');
  }
  const index = modIndexPath();
  if (fs.existsSync(index)) {
    await fs.promises.copyFile(index, path.join(directory, 'mods.json'));
  }

  const instance = activeInstance();
  const meta = {
    id,
    createdAt: new Date().toISOString(),
    instanceId: instance?.id || null,
    instanceName: instance?.name || '',
    actions: Array.isArray(actions) ? actions.map((action) => action.type) : []
  };
  await fs.promises.writeFile(path.join(directory, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
  await pruneAiBackups(root);
  return meta;
}

async function pruneAiBackups(root, keep = 12) {
  try {
    const entries = (await fs.promises.readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory());
    if (entries.length <= keep) return;
    const stats = await Promise.all(entries.map(async (entry) => ({
      name: entry.name,
      mtime: (await fs.promises.stat(path.join(root, entry.name))).mtimeMs
    })));
    stats.sort((a, b) => b.mtime - a.mtime);
    for (const old of stats.slice(keep)) {
      await fs.promises.rm(path.join(root, old.name), { recursive: true, force: true });
    }
  } catch {
    /* limpieza opcional */
  }
}

async function listAiBackups() {
  const root = aiBackupsRoot();
  let entries = [];
  try {
    entries = await fs.promises.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const backups = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const meta = JSON.parse(await fs.promises.readFile(path.join(root, entry.name, 'meta.json'), 'utf8'));
      backups.push({
        id: entry.name,
        createdAt: meta.createdAt || null,
        instanceName: meta.instanceName || '',
        actions: Array.isArray(meta.actions) ? meta.actions : []
      });
    } catch {
      /* copia incompleta */
    }
  }
  return backups.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 20);
}

async function applyAiAction(action) {
  const type = String(action?.type || '');
  switch (type) {
    case 'disable_mod': {
      const changed = await setModEnabled(action.file, false);
      return `Mod ${path.basename(String(action.file))} desactivado${changed ? '' : ' (ya estaba desactivado)'}.`;
    }
    case 'enable_mod': {
      const changed = await setModEnabled(action.file, true);
      return `Mod ${path.basename(String(action.file))} activado${changed ? '' : ' (ya estaba activo)'}.`;
    }
    case 'remove_mod': {
      const base = path.basename(String(action.file || ''));
      if (!base || !/\.jar(\.disabled)?$/i.test(base)) throw new Error('Archivo de mod no válido.');
      const target = path.join(gamePaths().mods, base);
      if (!fs.existsSync(target)) throw new Error(`El mod ${base} ya no existe.`);
      await fs.promises.unlink(target);
      forgetInstalledMod(base);
      return `Mod ${base} eliminado.`;
    }
    case 'set_memory': {
      const memory = sanitizeMemory({ min: action.min, max: action.max }, settings.memory);
      settings.memory = memory;
      const instance = activeInstance();
      if (instance && isPlainObject(instance.settings?.memory)) instance.settings.memory = memory;
      saveSettings();
      return `Memoria ajustada a ${memory.min}–${memory.max} GB.`;
    }
    case 'set_jvm_args': {
      const value = String(action.value || '').slice(0, 4000);
      settings.jvmArgs = value;
      const instance = activeInstance();
      if (instance && typeof instance.settings?.jvmArgs === 'string') instance.settings.jvmArgs = value;
      saveSettings();
      return value ? 'Argumentos JVM actualizados.' : 'Argumentos JVM vaciados.';
    }
    case 'set_java_path': {
      const value = String(action.value || '').trim();
      if (!value || !fs.existsSync(value) || !fs.statSync(value).isFile()) {
        throw new Error('La ruta de Java indicada no existe.');
      }
      settings.javaPath = value.slice(0, 512);
      const instance = activeInstance();
      if (instance && typeof instance.settings?.javaPath === 'string') instance.settings.javaPath = settings.javaPath;
      saveSettings();
      return `Java configurado en ${settings.javaPath}.`;
    }
    case 'repair_instance': {
      const instance = activeInstance();
      if (!instance) throw new Error('No hay una instancia activa.');
      const result = await repairInstanceFiles(instance, {});
      saveSettings();
      return result?.issues?.length
        ? `Reparación completada con ${result.issues.length} aviso(s).`
        : 'Archivos de la instancia verificados y reparados.';
    }
    default:
      throw new Error(`Acción no permitida: ${type}`);
  }
}

async function applyAiFixes(payload = {}) {
  const data = isPlainObject(payload) ? payload : {};
  if (activeProcess) throw new Error('Cierra Minecraft antes de aplicar cambios.');
  const actions = normalizeAiActions(data.actions);
  if (!actions.length) throw new Error('No hay cambios que aplicar.');

  const backup = await createAiBackup(actions);
  const applied = [];
  const failed = [];
  for (const action of actions) {
    try {
      applied.push({ type: action.type, detail: await applyAiAction(action) });
    } catch (error) {
      failed.push({ type: action.type, error: humanError(error) });
    }
  }
  return {
    backup,
    applied,
    failed,
    ...(await instanceState())
  };
}

async function restoreAiBackup(payload = {}) {
  const data = isPlainObject(payload) ? payload : {};
  const id = path.basename(String(data.id || ''));
  if (!id) throw new Error('Copia de seguridad no válida.');
  const root = aiBackupsRoot();
  const directory = path.join(root, id);
  if (!directory.startsWith(path.resolve(root)) || !fs.existsSync(path.join(directory, 'meta.json'))) {
    throw new Error('Esa copia de seguridad no existe.');
  }
  if (activeProcess) throw new Error('Cierra Minecraft antes de restaurar.');

  const mods = gamePaths().mods;
  await fs.promises.rm(mods, { recursive: true, force: true });
  ensureDir(mods);
  const backupMods = path.join(directory, 'mods');
  if (fs.existsSync(backupMods)) {
    await fs.promises.cp(backupMods, mods, { recursive: true });
  }

  const index = modIndexPath();
  const backupIndex = path.join(directory, 'mods.json');
  if (fs.existsSync(backupIndex)) {
    ensureDir(path.dirname(index));
    await fs.promises.copyFile(backupIndex, index);
  } else if (fs.existsSync(index)) {
    await fs.promises.rm(index, { force: true });
  }

  const backupSettings = readJson(path.join(directory, 'settings.json'), null);
  if (isPlainObject(backupSettings)) {
    const preserve = {
      activeAccountId: settings.activeAccountId,
      activeInstanceId: settings.activeInstanceId,
      seenWelcome: settings.seenWelcome,
      aiApiKey: settings.aiApiKey,
      curseforgeApiKey: settings.curseforgeApiKey
    };
    settings = { ...backupSettings, ...preserve };
    if (!Array.isArray(settings.instances) || !settings.instances.length) {
      settings.instances = backupSettings.instances || [];
    }
    if (!settings.instances.some((instance) => instance.id === settings.activeInstanceId)) {
      settings.activeInstanceId = settings.instances[0]?.id || null;
      settings.gameRoot = settings.instances[0]?.gameRoot || settings.gameRoot;
    }
    saveSettings();
  }

  return {
    restored: true,
    backup: { id },
    ...(await instanceState())
  };
}

/* -------------------------------------------------------------------------- */
/*                               Actualizaciones                              */
/* -------------------------------------------------------------------------- */

function parseVersion(value) {
  const match = /^v?(\d{1,4})\.(\d{1,4})\.(\d{1,4})(?:-([0-9A-Za-z.-]{1,40}))?$/.exec(String(value || '').trim());
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] || ''
  };
}

function compareVersions(a, b) {
  const left = typeof a === 'string' ? parseVersion(a) : a;
  const right = typeof b === 'string' ? parseVersion(b) : b;
  if (!left || !right) return 0;
  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) return left[key] > right[key] ? 1 : -1;
  }
  if (left.prerelease === right.prerelease) return 0;
  if (!left.prerelease) return 1;
  if (!right.prerelease) return -1;
  return left.prerelease > right.prerelease ? 1 : -1;
}

function normalizeUpdateUrl(value) {
  let url;
  try {
    url = new URL(String(value || ''));
  } catch {
    throw new Error('La dirección de descarga de la actualización no es válida.');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new Error('La actualización debe descargarse por HTTPS.');
  }
  if (url.username || url.password) throw new Error('La dirección de descarga de la actualización no es válida.');
  return url;
}

function normalizeUpdateManifest(raw) {
  if (!isPlainObject(raw)) throw new Error('El manifiesto de actualización no es válido.');
  const version = String(raw.version || '').trim();
  if (!parseVersion(version)) throw new Error('El manifiesto de actualización no indica una versión válida.');
  const url = normalizeUpdateUrl(raw.url);
  const notes = Array.isArray(raw.notes)
    ? raw.notes
        .filter((note) => typeof note === 'string' && note.trim())
        .map((note) => note.replace(/\s+/g, ' ').trim().slice(0, 240))
        .slice(0, 8)
    : [];
  const sha256 = typeof raw.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(raw.sha256.trim())
    ? raw.sha256.trim().toLowerCase()
    : '';
  return {
    version,
    url: url.toString(),
    notes,
    sha256,
    date: typeof raw.date === 'string' ? raw.date.slice(0, 10) : '',
    mandatory: raw.mandatory === true
  };
}

let updateCache = { at: 0, value: null };

async function checkLauncherUpdate(force = false) {
  const currentVersion = app.getVersion();
  const now = Date.now();
  if (!force && updateCache.value && now - updateCache.at < UPDATE_CACHE_MS) return updateCache.value;

  const base = {
    ok: true,
    available: false,
    currentVersion,
    checkedAt: new Date().toISOString()
  };

  let manifestUrl;
  try {
    manifestUrl = normalizeUpdateUrl(UPDATE_MANIFEST_URL);
  } catch {
    return { ...base, ok: false, error: 'La comprobación de actualizaciones no está configurada.' };
  }

  try {
    manifestUrl.searchParams.set('t', String(now));
    const manifest = normalizeUpdateManifest(await fetchJson(manifestUrl.toString(), {
      timeout: 12000,
      headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' }
    }));
    const value = {
      ...base,
      available: compareVersions(manifest.version, currentVersion) > 0,
      version: manifest.version,
      url: manifest.url,
      notes: manifest.notes,
      sha256: manifest.sha256,
      date: manifest.date,
      mandatory: manifest.mandatory
    };
    updateCache = { at: now, value };
    return value;
  } catch (error) {
    const message = String(error?.message || '');
    const friendly = /JSON|Unexpected token/i.test(message)
      ? 'El servidor de actualizaciones no devolvió un manifiesto válido.'
      : message || 'No se pudo comprobar si hay una nueva versión.';
    return { ...base, ok: false, error: friendly };
  }
}

/* -------------------------------------------------------------------------- */
/*                                   IPC                                      */
/* -------------------------------------------------------------------------- */

function registerIpc() {
  handle('app:init', async () => {
    ensureGameDirectories();
    const paths = gamePaths();
    const localVersions = await listLocalVersions();
    const mods = await listMods();
    const account = activeAccount();

    if (!javaCache) {
      setImmediate(() => {
        detectJavaCandidates().catch((error) => console.error('Error detectando Java:', error));
      });
    }

    return {
      settings: publicSettings(),
      accounts,
      activeAccount: account,
      servers,
      localVersions,
      mods,
      instances: await listInstances(),
      activeInstanceId: settings.activeInstanceId,
      java: javaCache || [],
      system: {
        totalMemory: totalMemoryGB(),
        freeMemory: Math.round(os.freemem() / 1024 ** 3),
        platform: process.platform,
        arch: process.arch,
        cpu: os.cpus()?.[0]?.model || 'CPU desconocida',
        appVersion: app.getVersion(),
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        node: process.versions.node,
        dataDir: DATA_DIR
      },
      paths
    };
  });

  handle('updates:check', async (force = false) => checkLauncherUpdate(force === true));

  handle('settings:save', async (patch) => {
    if (!isPlainObject(patch)) throw new Error('Datos de configuración inválidos.');

    if ('javaPath' in patch) settings.javaPath = String(patch.javaPath || '').slice(0, 512);
    if ('memory' in patch) settings.memory = sanitizeMemory(patch.memory, settings.memory);
    if ('resolution' in patch) settings.resolution = sanitizeResolution(patch.resolution, settings.resolution);
    if ('jvmArgs' in patch) settings.jvmArgs = String(patch.jvmArgs || '').slice(0, 4000);
    if ('gameArgs' in patch) settings.gameArgs = String(patch.gameArgs || '').slice(0, 4000);
    if ('minimizeOnLaunch' in patch) settings.minimizeOnLaunch = patch.minimizeOnLaunch !== false;
    if ('autoLogin' in patch) settings.autoLogin = patch.autoLogin !== false;
    if ('showSnapshots' in patch) settings.showSnapshots = patch.showSnapshots === true;
    if ('dismissedUpdateVersion' in patch) {
      const dismissed = String(patch.dismissedUpdateVersion || '').trim().slice(0, 32);
      settings.dismissedUpdateVersion = /^[0-9A-Za-z._-]+$/.test(dismissed) ? dismissed : '';
    }
    if ('theme' in patch) settings.theme = THEMES.includes(patch.theme) ? patch.theme : settings.theme;
    if ('language' in patch) settings.language = patch.language === 'en' ? 'en' : 'es';
    if ('lastVersion' in patch) {
      const version = safeVersionId(patch.lastVersion);
      if (version) settings.lastVersion = version;
      else if (patch.lastVersion === '') settings.lastVersion = '';
    }
    if ('lastLoader' in patch) {
      const loader = normalizeLoader(patch.lastLoader);
      if (loader) settings.lastLoader = loader;
    }
    if ('lastLoaderVersion' in patch) {
      if (patch.lastLoaderVersion === '') settings.lastLoaderVersion = '';
      else {
        const loaderVersion = safeVersionId(patch.lastLoaderVersion);
        if (loaderVersion) settings.lastLoaderVersion = loaderVersion;
      }
    }
    if ('curseforgeApiKey' in patch) {
      settings.curseforgeApiKey = String(patch.curseforgeApiKey || '').trim().slice(0, 200);
    }
    if ('aiApiKey' in patch) {
      settings.aiApiKey = String(patch.aiApiKey || '').trim().slice(0, 500);
    }
    if ('aiBaseUrl' in patch) {
      settings.aiBaseUrl = sanitizeAiBaseUrl(patch.aiBaseUrl);
    }
    if ('aiModel' in patch) {
      settings.aiModel = String(patch.aiModel || '').trim().slice(0, 120) || 'gpt-4o-mini';
    }
    if ('aiAutoReadCrash' in patch) {
      settings.aiAutoReadCrash = patch.aiAutoReadCrash === true;
    }
    if ('modProvider' in patch) {
      settings.modProvider = ['modrinth', 'curseforge'].includes(patch.modProvider)
        ? patch.modProvider
        : settings.modProvider;
    }

    const instance = activeInstance();
    if (instance) {
      instance.version = settings.lastVersion;
      instance.loader = settings.lastLoader;
      instance.loaderVersion = settings.lastLoaderVersion;
    }

    saveSettings();
    return publicSettings();
  });

  handle('ai:chat', async (payload) => aiChat(payload));

  handle('ai:test', async () => aiTest());

  handle('ai:context', async () => ({ context: await buildLauncherContext() }));

  handle('ai:pendingCrash', async () => publicCrash(pendingCrash));

  handle('ai:readCrash', async (id) => readCrashForAi(id));

  handle('ai:clearCrash', async () => {
    pendingCrash = null;
    return { ok: true };
  });

  handle('ai:apply', async (payload) => applyAiFixes(payload));

  handle('ai:restore', async (payload) => restoreAiBackup(payload));

  handle('ai:backups', async () => listAiBackups());

  handle('settings:reset', async () => {
    const defaults = defaultSettings();
    settings = {
      ...defaults,
      gameRoot: settings.gameRoot,
      instances: settings.instances,
      activeInstanceId: settings.activeInstanceId,
      activeAccountId: settings.activeAccountId,
      lastVersion: settings.lastVersion,
      lastLoader: settings.lastLoader,
      lastLoaderVersion: settings.lastLoaderVersion,
      seenWelcome: true
    };
    saveSettings();
    return publicSettings();
  });

  handle('settings:pickGameRoot', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Elegir carpeta de Minecraft',
      defaultPath: gamePaths().gameRoot,
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const target = path.resolve(result.filePaths[0]);
    if (settings.instances.some((instance) => instance.id !== settings.activeInstanceId && path.resolve(instance.gameRoot).toLowerCase() === target.toLowerCase())) {
      throw new Error('Esa carpeta ya pertenece a otra instancia.');
    }
    const instance = activeInstance();
    if (instance) instance.gameRoot = target;
    settings.gameRoot = target;
    saveSettings();
    ensureGameDirectories();
    return {
      canceled: false,
      settings: publicSettings(),
      instances: await listInstances(),
      activeInstanceId: settings.activeInstanceId,
      paths: gamePaths(),
      localVersions: await listLocalVersions(),
      mods: await listMods()
    };
  });

  handle('instances:list', async () => instanceState());

  handle('instances:create', async (payload) => {
    if (!isPlainObject(payload)) throw new Error('Datos de instancia inválidos.');
    const name = sanitizeInstanceName(payload.name);
    if (!name) throw new Error('Ponle un nombre a la instancia.');
    if (settings.instances.some((instance) => instance.name.toLowerCase() === name.toLowerCase())) {
      throw new Error('Ya existe una instancia con ese nombre.');
    }

    let root;
    if (typeof payload.directory === 'string' && payload.directory.trim()) {
      if (!path.isAbsolute(payload.directory)) throw new Error('La carpeta debe ser una ruta absoluta.');
      root = path.resolve(payload.directory);
      if (settings.instances.some((instance) => path.resolve(instance.gameRoot).toLowerCase() === root.toLowerCase())) {
        throw new Error('Esa carpeta ya pertenece a otra instancia.');
      }
    } else {
      root = uniqueInstanceDirectory(name);
    }

    const instance = {
      id: crypto.randomUUID(),
      name,
      gameRoot: root,
      createdAt: new Date().toISOString(),
      lastPlayedAt: null,
      version: safeVersionId(payload.version) || '',
      loader: normalizeLoader(payload.loader) || 'vanilla',
      loaderVersion: safeVersionId(payload.loaderVersion) || '',
      description: sanitizeInstanceDescription(payload.description),
      cover: sanitizeInstanceCover(payload.cover),
      settings: normalizeInstanceSettings(payload.settings)
    };
    if (instance.loader === 'vanilla') instance.loaderVersion = '';

    settings.instances.push(instance);
    ensureDir(root);
    for (const directory of ['mods', 'versions', 'logs', 'saves', 'resourcepacks', 'shaderpacks']) {
      ensureDir(path.join(root, directory));
    }
    writeInstanceMarker(instance);
    switchInstance(instance.id);
    return { instance: await instanceDetails(instance), ...(await instanceState()) };
  });

  handle('instances:update', async (payload) => {
    const data = isPlainObject(payload) ? payload : {};
    const instance = settings.instances.find((item) => item.id === data.id);
    if (!instance) throw new Error('La instancia no existe.');

    if ('name' in data) {
      const name = sanitizeInstanceName(data.name);
      if (!name) throw new Error('El nombre no es válido.');
      if (settings.instances.some((item) => item.id !== instance.id && item.name.toLowerCase() === name.toLowerCase())) {
        throw new Error('Ya existe una instancia con ese nombre.');
      }
      instance.name = name;
    }
    if ('version' in data) instance.version = safeVersionId(data.version) || '';
    if ('loader' in data) {
      const loader = normalizeLoader(data.loader);
      if (!loader) throw new Error('El cargador seleccionado no es válido.');
      if (loader !== instance.loader) instance.loaderVersion = '';
      instance.loader = loader;
    }
    if ('loaderVersion' in data) instance.loaderVersion = safeVersionId(data.loaderVersion) || '';
    if ('description' in data) instance.description = sanitizeInstanceDescription(data.description);
    if ('cover' in data) instance.cover = sanitizeInstanceCover(data.cover);
    if ('settings' in data) instance.settings = normalizeInstanceSettings(data.settings);
    if (instance.loader === 'vanilla') instance.loaderVersion = '';

    if (instance.id === settings.activeInstanceId) {
      settings.gameRoot = instance.gameRoot;
      settings.lastVersion = instance.version;
      settings.lastLoader = instance.loader;
      settings.lastLoaderVersion = instance.loaderVersion;
    }

    writeInstanceMarker(instance);
    saveSettings();
    return { instance: await instanceDetails(instance), ...(await instanceState()) };
  });

  handle('instances:select', async (id) => {
    switchInstance(typeof id === 'string' ? id : '');
    return instanceState();
  });

  handle('instances:rename', async (payload) => {
    const data = isPlainObject(payload) ? payload : {};
    const instance = settings.instances.find((item) => item.id === data.id);
    if (!instance) throw new Error('La instancia no existe.');
    const name = sanitizeInstanceName(data.name);
    if (!name) throw new Error('El nombre no es válido.');
    if (settings.instances.some((item) => item.id !== instance.id && item.name.toLowerCase() === name.toLowerCase())) {
      throw new Error('Ya existe una instancia con ese nombre.');
    }
    instance.name = name;
    writeInstanceMarker(instance);
    saveSettings();
    return instanceState();
  });

  handle('instances:duplicate', async (payload) => {
    const data = isPlainObject(payload) ? payload : {};
    const source = settings.instances.find((instance) => instance.id === data.id);
    if (!source) throw new Error('La instancia no existe.');
    const name = sanitizeInstanceName(data.name) || `${source.name} copia`;
    if (settings.instances.some((instance) => instance.name.toLowerCase() === name.toLowerCase())) {
      throw new Error('Ya existe una instancia con ese nombre.');
    }

    const root = uniqueInstanceDirectory(name);
    ensureDir(root);
    const copyWorlds = data.copyWorlds !== false;
    const folders = ['mods', 'config', 'resourcepacks', 'shaderpacks', 'defaultconfigs', 'scripts', 'kubejs'];
    if (copyWorlds) folders.push('saves');

    for (const folder of folders) {
      const from = path.join(source.gameRoot, folder);
      if (!fs.existsSync(from)) continue;
      await fs.promises.cp(from, path.join(root, folder), { recursive: true, force: true, errorOnExist: false });
    }
    const metadataFolder = path.join(source.gameRoot, MOD_INDEX_FOLDER);
    if (fs.existsSync(metadataFolder)) {
      await fs.promises.cp(metadataFolder, path.join(root, MOD_INDEX_FOLDER), { recursive: true, force: true, errorOnExist: false });
    }
    for (const file of ['options.txt', 'optionsof.txt', 'servers.dat', 'usercache.json']) {
      const from = path.join(source.gameRoot, file);
      if (!fs.existsSync(from)) continue;
      await fs.promises.copyFile(from, path.join(root, file)).catch(() => {});
    }
    for (const directory of ['mods', 'versions', 'logs', 'saves', 'resourcepacks', 'shaderpacks']) {
      ensureDir(path.join(root, directory));
    }

    const instance = {
      id: crypto.randomUUID(),
      name,
      gameRoot: root,
      createdAt: new Date().toISOString(),
      lastPlayedAt: null,
      version: source.version || '',
      loader: source.loader || 'vanilla',
      loaderVersion: source.loaderVersion || '',
      description: source.description || '',
      cover: source.cover || '',
      settings: normalizeInstanceSettings(source.settings)
    };
    settings.instances.push(instance);
    writeInstanceMarker(instance);
    saveSettings();
    return { instance: await instanceDetails(instance), ...(await instanceState()) };
  });

  handle('instances:remove', async (payload) => {
    const data = isPlainObject(payload) ? payload : {};
    const index = settings.instances.findIndex((instance) => instance.id === data.id);
    if (index === -1) throw new Error('La instancia no existe.');
    if (settings.instances.length <= 1) throw new Error('Debe quedar al menos una instancia.');

    const instance = settings.instances[index];
    if (data.deleteFiles === true) {
      const root = path.resolve(instance.gameRoot);
      const marker = readJson(instanceMarkerPath(root), null);
      if (!marker || marker.id !== instance.id) {
        throw new Error('Esta carpeta no fue creada por el launcher. Si quieres borrar sus archivos, hazlo manualmente.');
      }
      const forbidden = [
        path.parse(root).root,
        DATA_DIR,
        app.getPath('home'),
        app.getPath('appData')
      ].map((value) => path.resolve(value).toLowerCase());
      if (root.toLowerCase().length < 8 || forbidden.includes(root.toLowerCase())) {
        throw new Error('La carpeta de esta instancia no se puede borrar desde el launcher.');
      }
      await fs.promises.rm(root, { recursive: true, force: true, maxRetries: 3 });
    }

    settings.instances.splice(index, 1);
    if (settings.activeInstanceId === instance.id) {
      const next = settings.instances[0];
      settings.activeInstanceId = next.id;
      settings.gameRoot = next.gameRoot;
      settings.lastVersion = next.version || '';
      settings.lastLoader = next.loader || 'vanilla';
      settings.lastLoaderVersion = next.loaderVersion || '';
      ensureGameDirectories();
    }
    saveSettings();
    return instanceState();
  });

  handle('instances:pickFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Elegir carpeta para la instancia',
      buttonLabel: 'Usar esta carpeta',
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    return { canceled: false, directory: result.filePaths[0] };
  });

  handle('instances:import', async (payload = {}) => {
    let packPath = isPlainObject(payload) && typeof payload.path === 'string' ? payload.path : '';
    if (!packPath) {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Importar modpack o instancia',
        buttonLabel: 'Importar',
        properties: ['openFile'],
        filters: [
          { name: 'Modpacks compatibles', extensions: ['mrpack', 'zip'] },
          { name: 'Todos los archivos', extensions: ['*'] }
        ]
      });
      if (result.canceled || !result.filePaths[0]) return { canceled: true };
      packPath = result.filePaths[0];
    }

    emitInstanceProgress(null, 'open', 'Leyendo el modpack…', 2);
    const data = await importInstancePack(packPath, {});
    saveSettings();
    const state = await instanceState();
    return {
      canceled: false,
      provider: data.provider,
      installed: data.installed,
      warnings: data.warnings,
      instance: await instanceDetails(data.instance),
      ...state
    };
  });

  handle('instances:export', async (payload = {}) => {
    const data = isPlainObject(payload) ? payload : {};
    const instance = settings.instances.find((item) => item.id === data.id);
    if (!instance) throw new Error('La instancia no existe.');
    const format = data.format === 'zip' ? 'zip' : 'mrpack';
    const extension = format === 'mrpack' ? 'mrpack' : 'zip';
    const result = await dialog.showSaveDialog(mainWindow, {
      title: `Exportar «${instance.name}» como modpack`,
      defaultPath: path.join(app.getPath('downloads'), `${safeExportName(instance.name)}.${extension}`),
      filters: format === 'mrpack'
        ? [{ name: 'Modpack de Modrinth', extensions: ['mrpack'] }]
        : [{ name: 'Archivo ZIP', extensions: ['zip'] }]
    });
    if (result.canceled || !result.filePath) return { canceled: true };

    const target = path.resolve(result.filePath.toLowerCase().endsWith(`.${extension}`) ? result.filePath : `${result.filePath}.${extension}`);
    const root = path.resolve(instance.gameRoot);
    if (target.startsWith(`${root}${path.sep}`)) {
      throw new Error('Elige una carpeta fuera de la instancia para guardar el modpack.');
    }

    const temporary = path.join(DATA_DIR, 'cache', 'exports', `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${extension}`);
    ensureDir(path.dirname(temporary));
    ensureDir(path.dirname(target));
    emitInstanceProgress(instance.id, 'export', 'Preparando el modpack…', 10);
    try {
      const counters = exportInstanceToZip(instance, temporary, {
        format,
        includeWorlds: data.includeWorlds === true
      });
      emitInstanceProgress(instance.id, 'export', 'Guardando el modpack…', 90);
      await fs.promises.copyFile(temporary, target);
      const stat = await fs.promises.stat(target);
      emitInstanceProgress(instance.id, 'done', 'Modpack exportado.', 100);
      return {
        canceled: false,
        path: target,
        format,
        files: counters.files,
        bytes: counters.bytes,
        size: stat.size
      };
    } finally {
      fs.promises.rm(temporary, { force: true }).catch(() => {});
    }
  });

  handle('instances:verify', async (payload = {}) => {
    const data = isPlainObject(payload) ? payload : {};
    const instance = settings.instances.find((item) => item.id === data.id);
    if (!instance) throw new Error('La instancia no existe.');
    if (!fs.existsSync(instance.gameRoot)) throw new Error('La carpeta de esta instancia no existe.');
    const result = verifyInstanceFiles(instance);
    return {
      id: instance.id,
      name: instance.name,
      ...result,
      instance: await instanceDetails(instance)
    };
  });

  handle('instances:repair', async (payload = {}) => {
    const data = isPlainObject(payload) ? payload : {};
    const instance = settings.instances.find((item) => item.id === data.id);
    if (!instance) throw new Error('La instancia no existe.');
    if (!fs.existsSync(instance.gameRoot)) throw new Error('La carpeta de esta instancia no existe.');
    emitInstanceProgress(instance.id, 'repair', 'Preparando la reparación…', 2);
    const repaired = await repairInstanceFiles(instance, {});
    const result = verifyInstanceFiles(instance);
    saveSettings();
    return {
      id: instance.id,
      name: instance.name,
      ...result,
      repaired: repaired.instance,
      ...(instance.id === settings.activeInstanceId ? await instanceState() : {})
    };
  });

  handle('instances:pickJava', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Seleccionar Java para esta instancia',
      defaultPath: process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin') : undefined,
      properties: ['openFile'],
      filters: process.platform === 'win32' ? [{ name: 'Java', extensions: ['exe'] }] : []
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const info = await inspectJavaPath(result.filePaths[0]);
    if (!info) return { canceled: false, error: 'El archivo seleccionado no parece ser un Java válido.' };
    return { canceled: false, java: info };
  });

  handle('instances:pickCover', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Seleccionar carátula de la instancia',
      properties: ['openFile'],
      filters: [{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };

    const file = result.filePaths[0];
    const stat = await fs.promises.stat(file).catch(() => null);
    if (!stat || !stat.isFile()) throw new Error('No se pudo leer la imagen.');
    if (stat.size > 8 * 1024 * 1024) throw new Error('La imagen es demasiado grande (máximo 8 MB).');

    const image = nativeImage.createFromPath(file);
    if (image.isEmpty()) throw new Error('El formato de la imagen no es compatible.');

    const size = image.getSize();
    const scale = Math.min(1, 800 / Math.max(1, size.width), 450 / Math.max(1, size.height));
    const resized = scale < 1
      ? image.resize({
        width: Math.max(1, Math.round(size.width * scale)),
        height: Math.max(1, Math.round(size.height * scale)),
        quality: 'good'
      })
      : image;

    let dataUrl = `data:image/jpeg;base64,${resized.toJPEG(86).toString('base64')}`;
    if (dataUrl.length > 1_200_000) {
      dataUrl = `data:image/jpeg;base64,${resized.toJPEG(72).toString('base64')}`;
    }
    if (dataUrl.length > 1_200_000) throw new Error('La imagen sigue siendo demasiado grande. Prueba con una más pequeña.');
    return { canceled: false, cover: dataUrl, width: resized.getSize().width, height: resized.getSize().height };
  });

  handle('instances:openLog', async (id) => {
    const instance = settings.instances.find((item) => item.id === id) || activeInstance();
    if (!instance) throw new Error('La instancia no existe.');
    const log = path.join(path.resolve(instance.gameRoot), 'logs', 'latest.log');
    if (!fs.existsSync(log)) {
      throw new Error('Todavía no hay ningún latest.log. Inicia el juego al menos una vez.');
    }
    const error = await shell.openPath(log);
    if (error) throw new Error(error);
    return { ok: true, path: log };
  });

  handle('instances:analyzeLogs', async (id) => analyzeCrashLogs(id));

  handle('accounts:add', async (name) => {
    const clean = sanitizeUsername(name);
    if (!clean) throw new Error('El nombre debe tener entre 3 y 16 caracteres y solo puede usar letras, números o guion bajo.');

    let account = accounts.find((item) => item.name.toLowerCase() === clean.toLowerCase());
    if (!account) {
      account = {
        id: crypto.randomUUID(),
        name: clean,
        type: 'offline',
        createdAt: new Date().toISOString(),
        lastUsed: new Date().toISOString()
      };
      accounts.push(account);
    } else {
      account.lastUsed = new Date().toISOString();
    }

    settings.activeAccountId = account.id;
    settings.seenWelcome = true;
    writeJson(FILES.accounts, accounts);
    saveSettings();
    return { accounts, activeAccount: activeAccount() };
  });

  handle('accounts:activate', async (id) => {
    const account = accounts.find((item) => item.id === id);
    if (!account) throw new Error('Ese perfil ya no existe.');
    account.lastUsed = new Date().toISOString();
    settings.activeAccountId = account.id;
    settings.seenWelcome = true;
    writeJson(FILES.accounts, accounts);
    saveSettings();
    return { accounts, activeAccount: account };
  });

  handle('accounts:remove', async (id) => {
    const index = accounts.findIndex((item) => item.id === id);
    if (index === -1) throw new Error('Ese perfil ya no existe.');
    accounts.splice(index, 1);
    if (settings.activeAccountId === id) {
      settings.activeAccountId = accounts[0]?.id || null;
    }
    writeJson(FILES.accounts, accounts);
    saveSettings();
    return { accounts, activeAccount: activeAccount() };
  });

  handle('accounts:logout', async () => {
    settings.activeAccountId = null;
    saveSettings();
    return { accounts, activeAccount: null };
  });

  handle('servers:save', async (server) => {
    if (!isPlainObject(server)) throw new Error('Datos de servidor inválidos.');
    const address = normalizeAddress(server.address);
    if (!address) throw new Error('Dirección inválida. Usa un formato como play.ejemplo.net o play.ejemplo.net:25565.');
    const name = String(server.name || '').replace(/[\u0000-\u001F]/g, '').trim().slice(0, 40);
    if (!name) throw new Error('Escribe un nombre para el servidor.');

    if (server.id) {
      const existing = servers.find((item) => item.id === server.id);
      if (!existing) throw new Error('Ese servidor ya no existe.');
      existing.name = name;
      existing.address = address;
    } else {
      servers.push({ id: crypto.randomUUID(), name, address, createdAt: new Date().toISOString() });
    }

    writeJson(FILES.servers, servers);
    return servers;
  });

  handle('servers:remove', async (id) => {
    servers = servers.filter((server) => server.id !== id);
    writeJson(FILES.servers, servers);
    return servers;
  });

  handle('servers:ping', async (address) => pingMinecraftServer(address));

  handle('versions:local', async () => listLocalVersions());

  handle('versions:remote', async (force = false) => fetchManifest(force === true));

  handle('loaders:versions', async (payload = {}) => {
    const loader = normalizeLoader(payload?.loader);
    const mcVersion = safeVersionId(payload?.mcVersion);
    if (!loader || loader === 'vanilla') throw new Error('El cargador seleccionado no es válido.');
    if (!mcVersion) throw new Error('La versión de Minecraft no es válida.');
    return fetchLoaderVersions(loader, mcVersion, { force: payload?.force === true });
  });

  handle('loaders:install', async (payload = {}) => {
    const loader = normalizeLoader(payload?.loader);
    const mcVersion = safeVersionId(payload?.mcVersion);
    const loaderVersion = payload?.loaderVersion ? safeVersionId(payload.loaderVersion) : null;
    if (!loader || loader === 'vanilla') throw new Error('El cargador seleccionado no es válido.');
    if (!mcVersion) throw new Error('La versión de Minecraft no es válida.');
    if (payload?.loaderVersion && !loaderVersion) throw new Error('La versión del cargador no es válida.');

    const result = await ensureLoaderInstalled(loader, mcVersion, loaderVersion);
    loaderVersionsCache.delete(`${loader}:${mcVersion}`);
    return { ...result, localVersions: await listLocalVersions() };
  });

  handle('modrinth:search', async (payload = {}) => modrinthSearch(payload));

  handle('modrinth:project', async (payload = {}) => modrinthProject(payload));

  handle('modrinth:versions', async (payload = {}) => modrinthVersions(payload));

  handle('modrinth:install', async (payload = {}) => modrinthInstall({
    ...payload,
    onProgress: (progress) => sendToRenderer('mods:progress', {
      provider: 'modrinth',
      percent: progress.percent,
      received: progress.received,
      total: progress.total,
      version: progress.version || null
    })
  }));

  handle('curseforge:search', async (payload = {}) => curseforgeSearch(payload));

  handle('curseforge:versions', async (payload = {}) => curseforgeVersions(payload));

  handle('curseforge:install', async (payload = {}) => curseforgeInstall({
    ...payload,
    onProgress: (progress) => sendToRenderer('mods:progress', {
      provider: 'curseforge',
      percent: progress.percent,
      received: progress.received,
      total: progress.total
    })
  }));

  handle('curseforge:test', async () => {
    curseforgeApiKey();
    const data = await curseforgeRequest('/mods/search?gameId=432&classId=6&pageSize=1&index=0');
    return { ok: true, total: Number(data?.pagination?.totalCount) || 0 };
  });

  handle('mods:list', async () => listMods());

  handle('mods:add', async (paths) => {
    if (!Array.isArray(paths) || !paths.length) return { added: [], skipped: [], mods: await listMods() };
    return addModFiles(paths.map((item) => String(item)));
  });

  handle('mods:addBuffer', async ({ name, data } = {}) => addModBuffer(name, data));

  handle('mods:toggle', async (file) => {
    const directory = gamePaths().mods;
    const base = path.basename(String(file || ''));
    if (!base) throw new Error('Archivo inválido.');
    const source = path.join(directory, base);
    if (!fs.existsSync(source)) throw new Error('Ese mod ya no existe.');

    const enabled = !/\.disabled$/i.test(base);
    const target = enabled ? `${source}.disabled` : source.replace(/\.disabled$/i, '');
    if (fs.existsSync(target)) throw new Error('Ya existe un archivo con ese nombre.');
    await fs.promises.rename(source, target);
    return listMods();
  });

  handle('mods:select', async (payload = {}) => selectModVersion(payload.projectId, payload.file));

  handle('mods:checkUpdates', async () => checkModUpdates());

  handle('mods:update', async (payload = {}) => updateMods(payload));

  handle('mods:delete', async (file) => {
    const directory = gamePaths().mods;
    const base = path.basename(String(file || ''));
    if (!base) throw new Error('Archivo inválido.');
    const target = path.join(directory, base);
    if (!fs.existsSync(target)) throw new Error('Ese mod ya no existe.');
    await fs.promises.unlink(target);
    forgetInstalledMod(base);
    return listMods();
  });

  handle('content:list', async (kind) => listContent(kind));

  handle('content:add', async (payload = {}) => {
    if (!Array.isArray(payload.paths) || !payload.paths.length) {
      return { added: [], skipped: [], files: await listContent(payload.kind) };
    }
    return addContentFiles(payload.kind, payload.paths.map((item) => String(item)));
  });

  handle('content:toggle', async (payload = {}) => toggleContent(payload.kind, payload.file));

  handle('content:delete', async (payload = {}) => deleteContent(payload.kind, payload.file));

  handle('dialog:pickContent', async (kind) => {
    if (!CONTENT_KINDS[String(kind)]) throw new Error('Tipo de contenido no válido.');
    const label = CONTENT_KINDS[String(kind)].label;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: `Seleccionar ${label}s`,
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Archivos ZIP', extensions: ['zip', 'jar'] }]
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    return { canceled: false, ...(await addContentFiles(kind, result.filePaths)) };
  });

  handle('worlds:list', async () => listWorlds());

  handle('worlds:backups', async () => listWorldBackups());

  handle('worlds:backup', async (name) => backupWorld(name));

  handle('worlds:restore', async (file) => restoreWorldBackup(file));

  handle('worlds:deleteBackup', async (file) => deleteWorldBackup(file));

  handle('worlds:duplicate', async (name) => duplicateWorld(name));

  handle('worlds:delete', async (name) => deleteWorld(name));

  handle('worlds:open', async (name) => {
    const target = worldPath(name);
    const error = await shell.openPath(target);
    if (error) throw new Error(error);
    return { ok: true, path: target };
  });

  handle('screenshots:list', async () => listScreenshots());

  handle('screenshots:read', async (file) => readScreenshot(file));

  handle('screenshots:delete', async (file) => deleteScreenshot(file));

  handle('screenshots:open', async (file) => {
    const base = sanitizeScreenshotName(file);
    if (!base) throw new Error('Captura no válida.');
    const target = path.join(screenshotsDirectory(), base);
    if (!fs.existsSync(target)) throw new Error('Esa captura ya no existe.');
    const error = await shell.openPath(target);
    if (error) throw new Error(error);
    return { ok: true, path: target };
  });

  handle('dialog:pickMods', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Seleccionar mods',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Mods de Minecraft', extensions: ['jar'] }]
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    return { canceled: false, ...(await addModFiles(result.filePaths)) };
  });

  handle('dialog:pickJava', async (requiredMajor) => {
    const required = Number(requiredMajor);
    const wantsMajor = Number.isInteger(required) && required >= 8 && required <= 99;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: wantsMajor ? `Seleccionar Java ${required} o superior` : 'Seleccionar ejecutable de Java',
      defaultPath: process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin') : undefined,
      properties: ['openFile'],
      filters: process.platform === 'win32' ? [{ name: 'Java', extensions: ['exe'] }] : []
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };

    const info = await inspectJavaPath(result.filePaths[0]);
    if (!info) return { canceled: false, error: 'El archivo seleccionado no parece ser un Java válido.' };
    if (wantsMajor && info.major < required) {
      return {
        canceled: false,
        error: `Ese Java es la versión ${info.major}, pero Minecraft necesita Java ${required} o superior.`
      };
    }

    if (wantsMajor) settings.javaPaths[String(required)] = info.path;
    else settings.javaPath = info.path;
    saveSettings();

    if (javaCache && !javaCache.some((item) => item.path.toLowerCase() === info.path.toLowerCase())) {
      javaCache = [info, ...javaCache].sort((a, b) => b.major - a.major || b.version.localeCompare(a.version));
    }
    broadcastJava();
    return { canceled: false, java: info, required: wantsMajor ? required : null, settings: publicSettings() };
  });

  handle('java:install', async (payload) => {
    const major = Number(isPlainObject(payload) ? payload.major : payload);
    if (!Number.isInteger(major) || major < 8 || major > 99) throw new Error('Versión de Java no válida.');

    const result = await dialog.showOpenDialog(mainWindow, {
      title: `Elegir carpeta donde instalar Java ${major}`,
      buttonLabel: 'Instalar aquí',
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };

    const java = await installJavaInto(major, result.filePaths[0], (progress) => {
      sendToRenderer('java:install-progress', { major, ...progress });
    });
    return { canceled: false, java, settings: publicSettings() };
  });

  handle('java:detect', async (force = false) => detectJavaCandidates(force === true));

  handle('app:openFolder', async (key) => {
    const paths = gamePaths();
    const directories = {
      gameRoot: paths.gameRoot,
      instance: paths.gameRoot,
      instances: INSTANCES_DIR,
      mods: paths.mods,
      versions: paths.versions,
      logs: paths.logs,
      saves: paths.saves,
      resourcePacks: paths.resourcePacks,
      shaderPacks: paths.shaderPacks,
      screenshots: path.join(paths.gameRoot, 'screenshots'),
      data: DATA_DIR
    };
    const target = directories[String(key)];
    if (!target) throw new Error('Carpeta no válida.');
    ensureDir(target);
    const error = await shell.openPath(target);
    if (error) throw new Error(error);
    return { ok: true, path: target };
  });

  handle('app:openExternal', async (url) => {
    let parsed;
    try {
      parsed = new URL(String(url));
    } catch {
      throw new Error('Enlace inválido.');
    }
    if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Enlace no permitido.');
    await shell.openExternal(parsed.toString());
    return { ok: true };
  });

  handle('app:copyText', async (text) => {
    const value = String(text ?? '');
    if (!value) return { ok: false, message: 'No hay texto que copiar.' };
    if (value.length > 2_000_000) throw new Error('El texto es demasiado largo para copiarlo.');
    clipboard.writeText(value);
    return { ok: true };
  });

  handle('launch:start', async (payload) => {
    const account = activeAccount();
    if (!account) throw new Error('No hay un perfil de Minecraft activo. Elige un nombre primero.');
    if (!isPlainObject(payload)) throw new Error('Datos de lanzamiento inválidos.');
    return startLaunch({
      version: payload.version,
      server: payload.server || null,
      loader: payload.loader || 'vanilla',
      loaderVersion: payload.loaderVersion || '',
      account
    });
  });

  handle('launch:cancel', async () => stopLaunch());

  handle('launch:isRunning', async () => ({
    running: Boolean(activeProcess),
    preparing: Boolean(currentLaunch?.running && !activeProcess),
    version: currentLaunch?.version || null,
    loader: currentLaunch?.requestedLoader || null,
    phase: currentLaunch?.phase || null
  }));

  ipcMain.on('window:minimize', () => mainWindow?.minimize());
  ipcMain.on('window:toggleMaximize', () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.on('window:close', () => mainWindow?.close());
}

/* -------------------------------------------------------------------------- */
/*                              Ciclo de la app                               */
/* -------------------------------------------------------------------------- */

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    loadData();
    Menu.setApplicationMenu(null);
    registerIpc();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  }).catch((error) => {
    console.error('Error fatal al iniciar:', error);
    app.quit();
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

process.on('uncaughtException', (error) => {
  console.error('Excepción no controlada:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Promesa rechazada sin manejar:', error);
});
