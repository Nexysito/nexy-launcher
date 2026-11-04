'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

function subscribe(channel, callback) {
  if (typeof callback !== 'function') return () => {};
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('nexy', {
  platform: process.platform,
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return null;
    }
  },

  init: () => invoke('app:init'),

  settings: {
    save: (patch) => invoke('settings:save', patch),
    reset: () => invoke('settings:reset'),
    pickGameRoot: () => invoke('settings:pickGameRoot')
  },

  instances: {
    list: () => invoke('instances:list'),
    create: (payload) => invoke('instances:create', payload),
    update: (payload) => invoke('instances:update', payload),
    select: (id) => invoke('instances:select', id),
    rename: (payload) => invoke('instances:rename', payload),
    duplicate: (payload) => invoke('instances:duplicate', payload),
    remove: (payload) => invoke('instances:remove', payload),
    pickFolder: () => invoke('instances:pickFolder'),
    import: (payload) => invoke('instances:import', payload),
    export: (payload) => invoke('instances:export', payload),
    verify: (payload) => invoke('instances:verify', payload),
    repair: (payload) => invoke('instances:repair', payload),
    pickJava: () => invoke('instances:pickJava'),
    pickCover: () => invoke('instances:pickCover'),
    openLog: (id) => invoke('instances:openLog', id),
    analyzeLogs: (id) => invoke('instances:analyzeLogs', id)
  },

  accounts: {
    add: (name) => invoke('accounts:add', name),
    activate: (id) => invoke('accounts:activate', id),
    remove: (id) => invoke('accounts:remove', id),
    logout: () => invoke('accounts:logout')
  },

  servers: {
    save: (server) => invoke('servers:save', server),
    remove: (id) => invoke('servers:remove', id),
    ping: (address) => invoke('servers:ping', address)
  },

  versions: {
    local: () => invoke('versions:local'),
    remote: (force = false) => invoke('versions:remote', force === true)
  },

  updates: {
    check: (force = false) => invoke('updates:check', force === true)
  },

  loaders: {
    versions: (payload) => invoke('loaders:versions', payload),
    install: (payload) => invoke('loaders:install', payload)
  },

  modrinth: {
    search: (payload) => invoke('modrinth:search', payload),
    project: (payload) => invoke('modrinth:project', payload),
    versions: (payload) => invoke('modrinth:versions', payload),
    install: (payload) => invoke('modrinth:install', payload)
  },

  curseforge: {
    search: (payload) => invoke('curseforge:search', payload),
    versions: (payload) => invoke('curseforge:versions', payload),
    install: (payload) => invoke('curseforge:install', payload),
    test: () => invoke('curseforge:test')
  },

  mods: {
    list: () => invoke('mods:list'),
    add: (paths) => invoke('mods:add', paths),
    addBuffer: (name, data) => invoke('mods:addBuffer', { name, data }),
    toggle: (file) => invoke('mods:toggle', file),
    select: (payload) => invoke('mods:select', payload),
    checkUpdates: () => invoke('mods:checkUpdates'),
    update: (payload) => invoke('mods:update', payload),
    remove: (file) => invoke('mods:delete', file),
    pick: () => invoke('dialog:pickMods')
  },

  content: {
    list: (kind) => invoke('content:list', kind),
    add: (payload) => invoke('content:add', payload),
    toggle: (payload) => invoke('content:toggle', payload),
    remove: (payload) => invoke('content:delete', payload),
    pick: (kind) => invoke('dialog:pickContent', kind)
  },

  worlds: {
    list: () => invoke('worlds:list'),
    backups: () => invoke('worlds:backups'),
    backup: (name) => invoke('worlds:backup', name),
    restore: (file) => invoke('worlds:restore', file),
    deleteBackup: (file) => invoke('worlds:deleteBackup', file),
    duplicate: (name) => invoke('worlds:duplicate', name),
    remove: (name) => invoke('worlds:delete', name),
    open: (name) => invoke('worlds:open', name)
  },

  screenshots: {
    list: () => invoke('screenshots:list'),
    read: (file) => invoke('screenshots:read', file),
    remove: (file) => invoke('screenshots:delete', file),
    open: (file) => invoke('screenshots:open', file)
  },

  ai: {
    chat: (payload) => invoke('ai:chat', payload),
    test: () => invoke('ai:test'),
    context: () => invoke('ai:context'),
    pendingCrash: () => invoke('ai:pendingCrash'),
    readCrash: (id) => invoke('ai:readCrash', id),
    clearCrash: () => invoke('ai:clearCrash'),
    apply: (payload) => invoke('ai:apply', payload),
    restore: (payload) => invoke('ai:restore', payload),
    backups: () => invoke('ai:backups')
  },

  java: {
    detect: (force = false) => invoke('java:detect', force === true),
    pick: (requiredMajor) => invoke('dialog:pickJava', requiredMajor),
    install: (major) => invoke('java:install', { major })
  },

  launch: {
    start: (payload) => invoke('launch:start', payload),
    cancel: () => invoke('launch:cancel'),
    status: () => invoke('launch:isRunning')
  },

  openFolder: (key) => invoke('app:openFolder', key),
  openExternal: (url) => invoke('app:openExternal', url),
  copyText: (text) => invoke('app:copyText', text),

  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    toggleMaximize: () => ipcRenderer.send('window:toggleMaximize'),
    close: () => ipcRenderer.send('window:close'),
    onMaximized: (callback) => subscribe('window:maximized', callback)
  },

  onLaunchEvent: (callback) => subscribe('launch:event', callback),
  onModsProgress: (callback) => subscribe('mods:progress', callback),
  onInstancesProgress: (callback) => subscribe('instances:progress', callback),
  onJavaUpdate: (callback) => subscribe('system:java', callback),
  onJavaInstallProgress: (callback) => subscribe('java:install-progress', callback)
});
