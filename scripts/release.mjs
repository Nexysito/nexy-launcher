#!/usr/bin/env node
/* Compila el MSI, calcula su hash y genera dist/updates.json para publicar una actualización. */

import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packagePath = path.join(root, 'package.json');
const configPath = path.join(root, 'release.config.json');
const notesPath = path.join(root, 'release-notes.md');
const distDir = path.join(root, 'dist');

const log = (message) => console.log(`[release] ${message}`);
const fail = (message) => {
  console.error(`\n[release] ERROR: ${message}`);
  process.exit(1);
};

function versionParts(value) {
  const match = /^(\d{1,4})\.(\d{1,4})\.(\d{1,4})$/.exec(String(value || '').trim());
  return match ? match.slice(1).map(Number) : null;
}

function compareVersions(a, b) {
  const left = versionParts(a);
  const right = versionParts(b);
  if (!left || !right) return 0;
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index] ? 1 : -1;
  }
  return 0;
}

function run(command, args) {
  log(`Ejecutando: ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: true });
  if (result.status !== 0) fail(`El comando "${command} ${args.join(' ')}" terminó con error.`);
}

function readNotes() {
  const fallback = ['Mejoras de estabilidad y correcciones.'];
  if (!fs.existsSync(notesPath)) return fallback;

  const lines = fs.readFileSync(notesPath, 'utf8').split(/\r?\n/);
  const bullets = lines
    .filter((line) => /^\s*[-*]\s+\S/.test(line))
    .map((line) => line.replace(/^\s*[-*]\s+/, '').replace(/\s+/g, ' ').trim().slice(0, 240))
    .filter(Boolean);
  if (bullets.length) return bullets.slice(0, 8);

  const text = lines
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('<!--'))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text ? [text.slice(0, 240)] : fallback;
}

const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
let version = String(pkg.version || '').trim();
if (!versionParts(version)) fail('La versión de package.json no es válida.');

if (!fs.existsSync(configPath)) {
  fail('Falta release.config.json. Créalo con la propiedad "downloadBaseUrl".');
}
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const baseUrl = String(config.downloadBaseUrl || '').trim().replace(/\/+$/, '');
if (!/^https:\/\/\S+$/i.test(baseUrl)) {
  fail('Configura "downloadBaseUrl" en release.config.json con una URL HTTPS, por ejemplo https://github.com/USUARIO/nexy-updates/releases/latest/download');
}

const requested = String(process.argv[2] || '').trim();
if (requested) {
  if (!versionParts(requested)) fail('Indica una versión con formato 2.1.0.');
  const delta = compareVersions(requested, version);
  if (delta < 0) fail(`La nueva versión (${requested}) debe ser mayor que la actual (${version}).`);
  if (delta > 0) {
    run('npm', ['version', requested, '--no-git-tag-version', '--allow-same-version']);
    version = requested;
  } else {
    log(`La versión ${version} ya está en package.json; se reconstruye.`);
  }
}

run('npm', ['run', 'build:msi']);

const msiName = `NexyLauncher-${version}-x64.msi`;
const msiPath = path.join(distDir, msiName);
if (!fs.existsSync(msiPath)) fail(`No se generó ${msiName} en la carpeta dist.`);

const sha256 = crypto.createHash('sha256').update(fs.readFileSync(msiPath)).digest('hex').toUpperCase();
const manifest = {
  version,
  date: new Date().toISOString().slice(0, 10),
  url: `${baseUrl}/${msiName}`,
  sha256,
  notes: readNotes(),
  mandatory: config.mandatory === true
};

const manifestPath = path.join(distDir, 'updates.json');
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(`
[release] Listo para publicar NexyLauncher ${version}

  Instalador : dist\\${msiName}
  SHA256     : ${sha256}
  Manifiesto : dist\\updates.json

  Sube el MSI y updates.json al alojamiento configurado en "downloadBaseUrl".
  El launcher consulta el manifiesto en UPDATE_MANIFEST_URL (main.js).
`);
