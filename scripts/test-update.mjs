#!/usr/bin/env node
/* Prueba local del aviso de actualización: sirve un manifiesto falso y abre el launcher. */

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const parts = String(pkg.version || '1.0.0').split('.').map((part) => Number.parseInt(part, 10) || 0);
const fakeVersion = `${parts[0] || 2}.${parts[1] || 0}.${(parts[2] || 0) + 1}`;
const electronPath = require('electron');

const manifest = {
  version: fakeVersion,
  date: new Date().toISOString().slice(0, 10),
  url: `https://example.com/NexyLauncher-${fakeVersion}-x64.msi`,
  sha256: '0'.repeat(64),
  notes: [
    'Prueba local del aviso de actualización',
    'El botón Descargar abre una página de ejemplo'
  ],
  mandatory: false
};

/* Datos aislados para no tocar la partida ni los ajustes reales. */
const dataDir = path.join(os.tmpdir(), 'nexylauncher-update-test');
fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(path.join(dataDir, 'settings.json'), JSON.stringify({
  schema: 2,
  activeAccountId: 'update-test',
  autoLogin: true,
  dismissedUpdateVersion: ''
}, null, 2));
fs.writeFileSync(path.join(dataDir, 'accounts.json'), JSON.stringify([{
  id: 'update-test',
  name: 'Tester',
  type: 'offline',
  createdAt: new Date().toISOString(),
  lastUsed: null
}], null, 2));

const server = http.createServer((request, response) => {
  if (request.url?.split('?')[0] !== '/updates.json') {
    response.writeHead(404).end('No encontrado');
    return;
  }
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(manifest));
});

server.on('error', (error) => {
  console.error(`[test-update] No se pudo abrir el servidor local: ${error.message}`);
  process.exit(1);
});

server.listen(0, '127.0.0.1', () => {
  const { port } = server.address();
  console.log(`[test-update] Manifiesto falso: NexyLauncher ${fakeVersion}`);
  console.log(`[test-update] Datos de prueba: ${dataDir}`);
  console.log('[test-update] Abriendo el launcher. Debería aparecer el aviso en Inicio.');
  console.log('[test-update] Cierra la ventana del launcher para terminar la prueba.');

  const child = spawn(electronPath, ['.', ...process.argv.slice(2)], {
    cwd: root,
    env: {
      ...process.env,
      NEXY_UPDATE_URL: `http://127.0.0.1:${port}/updates.json`,
      NEXY_USER_DATA: dataDir
    },
    stdio: 'inherit'
  });

  child.on('exit', () => {
    server.close();
    console.log('[test-update] Prueba terminada.');
  });
});
