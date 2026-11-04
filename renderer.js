'use strict';

/*
 * NexyLauncher 1.0 — núcleo del renderer
 * Utilidades, sesión, navegación, avatares, avisos y modales.
 */
(() => {
  const api = window.nexy;
  const App = (window.NexyApp = {});
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  App.api = api;
  App.$ = $;
  App.$$ = $$;
  App.isMock = window.__NEXY_MOCK__ === true;

  if (!api) {
    document.body.innerHTML = `
      <div style="display:grid;place-items:center;height:100vh;background:#080a0f;color:#f3f5f9;font-family:'Segoe UI',sans-serif;text-align:center;padding:30px">
        <div>
          <h1 style="font-size:22px;margin:0 0 8px">No se pudo cargar NexyLauncher</h1>
          <p style="color:#808b9e;font-size:13px;max-width:430px;line-height:1.6;margin:0">El puente con Electron no está disponible. Abre la aplicación con <code>npm start</code> en lugar de abrir el archivo directamente.</p>
        </div>
      </div>`;
    return;
  }

  /* ---------------------------------------------------------------------- */
  /*                                Constantes                              */
  /* ---------------------------------------------------------------------- */

  const PAGE_META = {
    home: { eyebrow: 'PANEL PRINCIPAL', title: 'Inicio' },
    instances: { eyebrow: 'PERFILES AISLADOS', title: 'Instancias' },
    mods: { eyebrow: 'PERSONALIZACIÓN', title: 'Mods' },
    servers: { eyebrow: 'MULTIJUGADOR', title: 'Servidores' },
    content: { eyebrow: 'CONTENIDO LOCAL', title: 'Contenido' },
    ai: { eyebrow: 'ASISTENTE IA', title: 'Asistente' },
    settings: { eyebrow: 'CONFIGURACIÓN', title: 'Ajustes' }
  };

  const THEMES = ['violet', 'emerald', 'amber', 'azure', 'rose'];
  const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/;
  const SERVER_RE = /^(?:\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9._-]{1,253})(?::(\d{1,5}))?$/;

  const TYPE_LABELS = {
    release: 'Lanzamiento',
    snapshot: 'Snapshot',
    old_beta: 'Beta antigua',
    old_alpha: 'Alpha antigua',
    custom: 'Personalizada'
  };

  const LOADER_LABELS = {
    vanilla: 'Vanilla',
    fabric: 'Fabric',
    forge: 'Forge',
    neoforge: 'NeoForge',
    quilt: 'Quilt'
  };

  /* Formulario de feedback y contacto directo. El servidor de Discord llegará próximamente. */
  const FEEDBACK_LINKS = {
    form: 'https://forms.gle/P9tj3YZHLfMRQH5j8'
  };
  const DISCORD_CONTACT = 'zombigamer55';

  const state = {
    settings: null,
    accounts: [],
    account: null,
    servers: [],
    localVersions: [],
    instances: [],
    activeInstanceId: null,
    remote: null,
    remoteError: null,
    remoteLoading: false,
    remoteRequested: false,
    mods: [],
    java: [],
    javaReady: false,
    system: {},
    paths: {},
    page: 'home',
    modsQuery: '',
    modsTab: 'installed',
    loader: 'vanilla',
    loaderVersion: '',
    loaderVersions: {},
    loaderLoading: false,
    loaderError: null,
    loaderRequest: 0,
    modProvider: 'modrinth',
    modQuery: '',
    modGameVersion: null,
    modLoaderFilter: '',
    modOffset: 0,
    modResults: [],
    modTotal: 0,
    modLoading: false,
    modError: null,
    modRequest: 0,
    modDetail: null,
    modProgress: null,
    loaded: false,
    launch: { active: false, phase: null, logs: [] }
  };

  App.state = state;

  function activeInstanceEntry() {
    return state.instances.find((instance) => instance.id === state.activeInstanceId) || state.instances[0] || null;
  }

  function effectiveSettings(instance = activeInstanceEntry()) {
    const base = state.settings || {};
    const overrides = instance?.settings && typeof instance.settings === 'object' ? instance.settings : {};
    return {
      memory: overrides.memory || base.memory || { min: 2, max: 4 },
      resolution: overrides.resolution || base.resolution || { width: 1280, height: 720, fullscreen: false },
      jvmArgs: typeof overrides.jvmArgs === 'string' ? overrides.jvmArgs : (base.jvmArgs || ''),
      gameArgs: typeof overrides.gameArgs === 'string' ? overrides.gameArgs : (base.gameArgs || ''),
      javaPath: typeof overrides.javaPath === 'string' ? overrides.javaPath : (base.javaPath || ''),
      minimizeOnLaunch: typeof overrides.minimizeOnLaunch === 'boolean' ? overrides.minimizeOnLaunch : base.minimizeOnLaunch !== false
    };
  }

  App.activeInstanceEntry = activeInstanceEntry;
  App.effectiveSettings = effectiveSettings;

  App.applyInstanceState = function applyInstanceState(data) {
    if (!data) return;
    if (data.settings) state.settings = data.settings;
    if (Array.isArray(data.instances)) state.instances = data.instances;
    if (typeof data.activeInstanceId === 'string') state.activeInstanceId = data.activeInstanceId;
    if (data.paths) state.paths = data.paths;
    if (Array.isArray(data.localVersions)) state.localVersions = data.localVersions;
    if (Array.isArray(data.mods)) state.mods = data.mods;
    if (state.settings) {
      state.loader = state.settings.lastLoader || 'vanilla';
      state.loaderVersion = state.settings.lastLoaderVersion || '';
    }
    const active = state.instances.find((instance) => instance.id === state.activeInstanceId) || state.instances[0] || null;
    state.modGameVersion = null;
    state.modLoaderFilter = active && active.loader && active.loader !== 'vanilla' ? active.loader : '';
    App.home?.render?.();
    App.instances?.render?.();
    App.mods?.render?.();
    if (state.page === 'content') App.content?.refresh?.();
    App.ai?.render?.();
    App.settings?.render?.();
  };

  /* ---------------------------------------------------------------------- */
  /*                                Utilidades                              */
  /* ---------------------------------------------------------------------- */

  const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ESCAPES[character]);
  const icon = (name, className = 'icon') => `<svg class="${className}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;

  App.esc = esc;
  App.icon = icon;

  function clamp(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return min;
    return Math.min(max, Math.max(min, number));
  }

  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
  }

  function relativeDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    const diff = Date.now() - date.getTime();
    const minutes = Math.round(diff / 60000);
    if (minutes < 1) return 'hace un momento';
    if (minutes < 60) return `hace ${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `hace ${hours} h`;
    const days = Math.round(hours / 24);
    if (days < 30) return `hace ${days} d`;
    return formatDate(value);
  }

  function formatBytes(bytes) {
    const number = Number(bytes) || 0;
    if (number < 1024) return `${number} B`;
    if (number < 1024 ** 2) return `${(number / 1024).toFixed(0)} KB`;
    if (number < 1024 ** 3) return `${(number / 1024 ** 2).toFixed(1)} MB`;
    return `${(number / 1024 ** 3).toFixed(2)} GB`;
  }

  function formatNumber(value) {
    const number = Number(value) || 0;
    if (number < 1000) return String(number);
    return new Intl.NumberFormat('es-ES', { notation: 'compact', maximumFractionDigits: 1 }).format(number);
  }

  function debounce(callback, wait = 300) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => callback(...args), wait);
    };
  }

  function typeLabel(type) {
    return TYPE_LABELS[type] || 'Personalizada';
  }

  function loaderLabel(id) {
    return LOADER_LABELS[id] || 'Vanilla';
  }

  function isBaseVersion(version) {
    if (!version) return false;
    return !version.base && (!version.loaderId || version.loaderId === 'vanilla');
  }

  function typeClass(type) {
    if (type === 'release' || type === 'snapshot') return type;
    return 'custom';
  }

  function requiredJava(version) {
    const id = String(version || '');
    const local = Array.isArray(state.localVersions)
      ? state.localVersions.find((item) => item.id === id)
      : null;
    if (local && Number.isInteger(local.javaMajor) && local.javaMajor >= 8) return local.javaMajor;

    const match = /^1\.(\d+)(?:\.(\d+))?/.exec(id);
    if (!match) {
      // Versionado por año (por ejemplo 26.3): Minecraft usa Java 25.
      return /^\d{2,}\.\d+/.test(id) ? 25 : 21;
    }
    const minor = Number(match[1]);
    const patch = Number(match[2] || 0);
    if (minor < 17) return 8;
    if (minor === 17) return 17;
    if (minor < 20 || (minor === 20 && patch < 5)) return 17;
    return 21;
  }

  function selectedVersion() {
    return $('#version-select')?.value || state.settings?.lastVersion || '';
  }

  function bestJava() {
    const list = Array.isArray(state.java) ? state.java : [];
    if (state.settings?.javaPath) {
      const manual = list.find((item) => item.path?.toLowerCase() === state.settings.javaPath.toLowerCase());
      if (manual) return manual;
    }
    return list.slice().sort((a, b) => b.major - a.major || b.version.localeCompare(a.version))[0] || null;
  }

  function javaForVersion(version) {
    const list = Array.isArray(state.java) ? state.java : [];
    if (!list.length) return null;
    const required = requiredJava(version);
    const instancePath = activeInstanceEntry()?.settings?.javaPath;
    if (typeof instancePath === 'string' && instancePath) {
      const own = list.find((item) => item.path?.toLowerCase() === instancePath.toLowerCase());
      if (own) return own;
    }
    const savedPath = state.settings?.javaPaths?.[String(required)];
    if (savedPath) {
      const saved = list.find((item) => item.path?.toLowerCase() === savedPath.toLowerCase());
      if (saved) return saved;
    }
    if (state.settings?.javaPath) return bestJava();
    const sorted = list
      .slice()
      .sort((a, b) => a.major - b.major || a.version.localeCompare(b.version, undefined, { numeric: true }));
    return sorted.find((item) => item.major === required)
      || sorted.find((item) => item.major > required)
      || list.slice().sort((a, b) => b.major - a.major || a.version.localeCompare(a.version, undefined, { numeric: true }))[0]
      || null;
  }

  function errorMessage(error) {
    if (!error) return 'Error desconocido.';
    return String(error.message || error);
  }

  App.clamp = clamp;
  App.formatDate = formatDate;
  App.relativeDate = relativeDate;
  App.formatBytes = formatBytes;
  App.formatNumber = formatNumber;
  App.debounce = debounce;
  App.typeLabel = typeLabel;
  App.typeClass = typeClass;
  App.loaderLabel = loaderLabel;
  App.isBaseVersion = isBaseVersion;
  App.requiredJava = requiredJava;
  App.selectedVersion = selectedVersion;
  App.bestJava = bestJava;
  App.javaForVersion = javaForVersion;
  App.errorMessage = errorMessage;

  async function copyText(text) {
    const value = String(text ?? '');
    if (!value) {
      toast('No hay texto que copiar.', 'info');
      return false;
    }
    try {
      if (typeof api.copyText === 'function') {
        const result = await api.copyText(value);
        if (result?.ok === false) throw new Error(result.message || 'El portapapeles no está disponible.');
        return true;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
      }
      throw new Error('El portapapeles no está disponible.');
    } catch (error) {
      App.toastError(errorMessage(error), 'No se pudo copiar');
      return false;
    }
  }

  App.copyText = copyText;

  function platformLabel(platform) {
    return ({ win32: 'Windows', darwin: 'macOS', linux: 'Linux' })[platform] || platform || 'Desconocido';
  }

  function feedbackDiagnostics() {
    const system = state.system || {};
    const instance = activeInstanceEntry();
    const version = selectedVersion() || instance?.version || '';
    const loader = instance?.loader || state.loader || 'vanilla';
    const loaderVersion = instance?.loaderVersion || state.loaderVersion || '';
    const required = requiredJava(version);
    const java = javaForVersion(version);
    const mods = Array.isArray(state.mods) ? state.mods : [];
    const activeMods = mods.filter((mod) => mod.enabled).length;
    const javaLabel = java
      ? `Java ${java.major} · ${java.vendor || 'Java'} ${java.version || ''}`.trim()
      : 'no detectado';

    return [
      `NexyLauncher ${system.appVersion || '1.0.0'}`,
      `Electron ${system.electron || '—'} · Chromium ${system.chrome || '—'} · Node ${system.node || '—'}`,
      `${platformLabel(system.platform)} · ${system.arch || 'arquitectura desconocida'}`,
      `CPU: ${system.cpu || '—'}`,
      `RAM: ${system.totalMemory ?? '—'} GB (${system.freeMemory ?? '—'} GB libres)`,
      `Java: ${javaLabel} (requerido ${required}+)`,
      `Cuenta: ${state.account?.name || 'sin cuenta'}`,
      `Instancia: ${instance?.name || '—'}`,
      `Minecraft: ${version || '—'} · ${loaderLabel(loader)}${loaderVersion ? ` ${loaderVersion}` : ''}`,
      `Mods: ${mods.length} (${activeMods} activo${activeMods === 1 ? '' : 's'})`,
      `Carpeta del juego: ${instance?.gameRoot || state.paths?.gameRoot || '—'}`,
      `Carpeta de datos: ${system.dataDir || '—'}`,
      `Logs: ${state.paths?.logs || '—'}`
    ].join('\n');
  }

  async function copyDiagnostics() {
    const copied = await copyText(feedbackDiagnostics());
    if (copied) toast('Diagnóstico copiado. Pégalo en Discord o en el formulario.', 'success', 'Copiado');
    return copied;
  }

  async function openFeedback(kind) {
    if (kind === 'discord-user') {
      const copied = await copyText(DISCORD_CONTACT);
      if (copied) {
        toast(`Usuario ${DISCORD_CONTACT} copiado. Abre Discord y envía un mensaje directo.`, 'success', 'Mensaje directo');
      } else {
        toast(`Escríbeme por mensaje directo en Discord a ${DISCORD_CONTACT}.`, 'info', 'Mensaje directo');
      }
      return;
    }
    const url = FEEDBACK_LINKS[kind];
    if (!url) {
      toast('Este enlace estará disponible próximamente.', 'warning', 'Próximamente');
      return;
    }
    try {
      await api.openExternal(url);
    } catch (error) {
      toastError(errorMessage(error), 'No se pudo abrir el enlace');
    }
  }

  async function openLogs() {
    try {
      await api.openFolder('logs');
    } catch (error) {
      toastError(errorMessage(error), 'No se pudo abrir la carpeta de logs');
    }
  }

  App.FEEDBACK_LINKS = FEEDBACK_LINKS;
  App.feedbackDiagnostics = feedbackDiagnostics;
  App.copyDiagnostics = copyDiagnostics;
  App.openFeedback = openFeedback;
  App.openLogs = openLogs;
  App.USERNAME_RE = USERNAME_RE;
  App.SERVER_RE = SERVER_RE;
  App.THEMES = THEMES;

  /* ---------------------------------------------------------------------- */
  /*                                Avatares                                */
  /* ---------------------------------------------------------------------- */

  function hashName(name) {
    let hash = 2166136261;
    const text = String(name || 'Steve');
    for (let index = 0; index < text.length; index++) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function avatarSvg(name) {
    const hash = hashName(name);
    const skins = ['#f6cda6', '#ecc19a', '#e0a97e', '#cf9066', '#b97a4e', '#9b6238'];
    const hairs = ['#241b16', '#3d2a1d', '#5b3a24', '#7b4b2a', '#b07d3c', '#d6a84f', '#7c3aed', '#2563eb', '#0f766e', '#be123c', '#c026d3', '#475569'];
    const shirts = ['#6d5bd0', '#2f9e8f', '#c05a4e', '#3d7dbb', '#a26d2f', '#7b54a8', '#3b8b57', '#a34474'];
    const skin = skins[hash % skins.length];
    const hair = hairs[(hash >>> 4) % hairs.length];
    const shirt = shirts[(hash >>> 9) % shirts.length];
    const shade = 'rgba(43, 24, 12, 0.24)';
    const bright = 'rgba(255, 255, 255, 0.16)';
    const eye = '#1c2431';
    const parts = [
      `<rect width="8" height="8" fill="#1b2130"/>`,
      `<rect y="7" width="8" height="1" fill="${shirt}"/>`,
      `<rect x="3" y="7" width="2" height="1" fill="${bright}"/>`,
      `<rect x="0" y="0" width="8" height="7" fill="${skin}"/>`,
      `<rect x="0" y="0" width="8" height="2" fill="${hair}"/>`,
      `<rect x="0" y="2" width="1" height="4" fill="${hair}"/>`,
      `<rect x="7" y="2" width="1" height="4" fill="${hair}"/>`,
      `<rect x="1" y="2" width="1" height="1" fill="${hair}"/>`,
      `<rect x="6" y="2" width="1" height="1" fill="${hair}"/>`,
      `<rect x="1" y="3" width="2" height="2" fill="#f7f9fc"/>`,
      `<rect x="1" y="3" width="1" height="2" fill="${eye}"/>`,
      `<rect x="5" y="3" width="2" height="2" fill="#f7f9fc"/>`,
      `<rect x="6" y="3" width="1" height="2" fill="${eye}"/>`,
      `<rect x="3" y="4" width="2" height="1" fill="${shade}"/>`,
      `<rect x="2" y="5" width="4" height="1" fill="${shade}"/>`,
      `<rect x="6" y="6" width="2" height="1" fill="${shade}" opacity="0.5"/>`,
      `<rect x="0" y="6" width="1" height="1" fill="${shade}" opacity="0.5"/>`
    ];
    return `<svg viewBox="0 0 8 8" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${parts.join('')}</svg>`;
  }

  function paintAvatar(element, name) {
    if (!element) return;
    element.innerHTML = avatarSvg(name);
    element.title = name ? `Avatar de ${name}` : 'Sin sesión';
  }

  App.avatarSvg = avatarSvg;
  App.paintAvatar = paintAvatar;

  /* ---------------------------------------------------------------------- */
  /*                          Avisos y estados busy                         */
  /* ---------------------------------------------------------------------- */

  function toast(message, type = 'info', title = '') {
    const host = $('#toasts');
    if (!host) return;
    const icons = { success: 'check', error: 'alert', warning: 'alert', info: 'info' };
    const titles = { success: 'Hecho', error: 'Algo salió mal', warning: 'Atención', info: 'NexyLauncher' };
    const element = document.createElement('div');
    element.className = `toast ${type}`;
    element.innerHTML = `
      <span class="toast-icon">${icon(icons[type] || 'info')}</span>
      <div class="toast-copy"><strong>${esc(title || titles[type] || 'Aviso')}</strong><p>${esc(message)}</p></div>
      <button class="toast-close" aria-label="Cerrar aviso">${icon('x')}</button>`;
    host.appendChild(element);
    while (host.children.length > 4) host.firstElementChild.remove();

    let timer = setTimeout(dismiss, type === 'error' ? 6500 : 4500);
    function dismiss() {
      clearTimeout(timer);
      if (!element.isConnected) return;
      element.classList.add('leaving');
      setTimeout(() => element.remove(), 220);
    }
    element.querySelector('.toast-close').addEventListener('click', dismiss);
  }

  App.toast = toast;
  App.toastError = (message, title) => toast(message, 'error', title);
  App.toastSuccess = (message, title) => toast(message, 'success', title);

  function setBusy(button, busy, busyText = '') {
    if (!button) return;
    if (busy) {
      if (!button.dataset.original) button.dataset.original = button.innerHTML;
      button.disabled = true;
      button.innerHTML = `<span class="spinner"></span>${busyText ? `<span>${esc(busyText)}</span>` : ''}`;
    } else {
      button.disabled = false;
      if (button.dataset.original) {
        button.innerHTML = button.dataset.original;
        delete button.dataset.original;
      }
    }
  }

  App.setBusy = setBusy;

  /* ---------------------------------------------------------------------- */
  /*                                  Modales                               */
  /* ---------------------------------------------------------------------- */

  let modalCloseCallback = null;

  function openModal(html, options = {}) {
    const overlay = $('#modal-overlay');
    const modal = $('#modal');
    modal.className = `modal${options.wide ? ' modal-wide' : ''}`;
    modal.innerHTML = html;
    overlay.hidden = false;
    modalCloseCallback = typeof options.onClose === 'function' ? options.onClose : null;
    setTimeout(() => {
      const focusable = modal.querySelector('input, select, textarea, .btn-primary, .btn-danger');
      focusable?.focus();
    }, 60);
    return modal;
  }

  function closeModal() {
    const overlay = $('#modal-overlay');
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    $('#modal').innerHTML = '';
    const callback = modalCloseCallback;
    modalCloseCallback = null;
    if (callback) callback();
  }

  App.openModal = openModal;
  App.closeModal = closeModal;

  function modalHead(eyebrow, title, description = '') {
    return `
      <div class="modal-head">
        <div>
          <span class="eyebrow">${esc(eyebrow)}</span>
          <h2>${esc(title)}</h2>
          ${description ? `<p>${esc(description)}</p>` : ''}
        </div>
        <button class="icon-btn modal-close" data-modal-close aria-label="Cerrar">${icon('x')}</button>
      </div>`;
  }

  App.modalHead = modalHead;

  function confirmDialog(options = {}) {
    const title = options.title || '¿Seguro?';
    const message = options.message || '';
    const confirmLabel = options.confirm || 'Confirmar';
    const danger = options.danger !== false;
    const iconName = options.icon || 'alert';

    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        closeModal();
        resolve(value);
      };
      const modal = openModal(`
        <div class="modal-icon ${danger ? 'danger' : ''}">${icon(iconName)}</div>
        ${modalHead(options.eyebrow || 'CONFIRMAR', title)}
        <p class="modal-text">${esc(message)}</p>
        <div class="modal-actions">
          <button class="btn btn-ghost" data-confirm-cancel>Cancelar</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-confirm-ok>${esc(confirmLabel)}</button>
        </div>`, {
        onClose: () => {
          if (!settled) {
            settled = true;
            resolve(false);
          }
        }
      });
      modal.querySelector('[data-confirm-cancel]').addEventListener('click', () => finish(false));
      modal.querySelector('[data-confirm-ok]').addEventListener('click', () => finish(true));
    });
  }

  App.confirmDialog = confirmDialog;

  /* ---------------------------------------------------------------------- */
  /*                          Ventana y navegación                          */
  /* ---------------------------------------------------------------------- */

  function applyTheme(theme) {
    const name = THEMES.includes(theme) ? theme : 'violet';
    $('#app').dataset.theme = name;
    $$('.theme-dot').forEach((button) => button.classList.toggle('active', button.dataset.theme === name));
    return name;
  }

  App.applyTheme = applyTheme;

  function go(page) {
    if (!PAGE_META[page] || !$(`#page-${page}`)) return;
    state.page = page;
    $$('.rail-btn').forEach((button) => button.classList.toggle('active', button.dataset.page === page));
    $$('.page').forEach((section) => section.classList.toggle('active', section.id === `page-${page}`));
    $('#page-eyebrow').textContent = PAGE_META[page].eyebrow;
    $('#page-title').textContent = PAGE_META[page].title;
    $('#pages').scrollTo({ top: 0, behavior: 'smooth' });
    if (page === 'mods') App.mods?.ensureBrowser?.();
    if (page === 'servers') App.servers?.refreshStatuses?.();
    if (page === 'content') App.content?.refresh?.();
    if (page === 'ai') App.ai?.render?.();
    if (page === 'settings') App.settings?.refreshSystem?.();
  }

  App.go = go;

  function hideBootScreen() {
    const boot = $('#boot-screen');
    if (!boot || boot.classList.contains('hidden')) return;
    boot.classList.add('hidden');
    setTimeout(() => boot.remove(), 350);
  }

  App.hideBootScreen = hideBootScreen;

  function showLogin() {
    hideBootScreen();
    $('#screen-app').classList.remove('active');
    $('#screen-login').classList.add('active');
    App.launch?.hideDock?.();
    App.launch?.closeConsole?.();
    renderSavedAccounts();
    const input = $('#login-username');
    if (input) {
      const last = state.accounts[0]?.name || '';
      if (!input.value) input.value = last;
      setTimeout(() => input.focus(), 160);
    }
    updateNetworkPill();
  }

  function enterApp() {
    if (!state.account) {
      showLogin();
      return;
    }
    hideBootScreen();
    $('#screen-login').classList.remove('active');
    $('#screen-app').classList.add('active');
    renderAccountUI();
    go('home');
  }

  App.showLogin = showLogin;
  App.enterApp = enterApp;

  function updateAuth(result) {
    if (!result) return;
    if (Array.isArray(result.accounts)) state.accounts = result.accounts;
    state.account = result.activeAccount || null;
    if (state.settings) state.settings.activeAccountId = state.account?.id || null;
    renderAccountUI();
    renderSavedAccounts();
  }

  App.updateAuth = updateAuth;

  function renderAccountUI() {
    const name = state.account?.name || 'Invitado';
    ['#hero-avatar', '#topbar-avatar', '#rail-avatar'].forEach((selector) => paintAvatar($(selector), name));
    const username = $('#topbar-username');
    if (username) username.textContent = name;
    const heroName = $('#hero-username');
    if (heroName) heroName.textContent = name;
    const rail = $('#btn-account-rail');
    if (rail) rail.title = state.account ? `Perfil: ${name}` : 'Iniciar sesión';
  }

  App.renderAccountUI = renderAccountUI;

  function renderSavedAccounts() {
    const wrap = $('#saved-accounts-wrap');
    const host = $('#saved-accounts');
    if (!wrap || !host) return;
    const accounts = Array.isArray(state.accounts) ? state.accounts : [];
    wrap.hidden = accounts.length === 0;
    host.innerHTML = accounts.slice(0, 4).map((account) => `
      <button class="saved-account" data-saved-account="${esc(account.id)}" title="Entrar como ${esc(account.name)}">
        <span class="avatar">${avatarSvg(account.name)}</span>
        <span class="saved-account-copy">
          <span class="saved-account-name">${esc(account.name)}</span>
          <span class="saved-account-meta">${account.lastUsed ? `Usado ${relativeDate(account.lastUsed)}` : 'Cuenta offline'}</span>
        </span>
      </button>`).join('');

    $$('[data-saved-account]', host).forEach((button) => {
      button.addEventListener('click', async () => {
        const id = button.dataset.savedAccount;
        button.disabled = true;
        try {
          const result = await api.accounts.activate(id);
          updateAuth(result);
          enterApp();
          toast(`Has entrado como ${state.account?.name || 'jugador'}.`, 'success', 'Sesión iniciada');
        } catch (error) {
          toastError(errorMessage(error));
        } finally {
          button.disabled = false;
        }
      });
    });
  }

  App.renderSavedAccounts = renderSavedAccounts;

  function updateNetworkPill() {
    const pill = $('#pill-network');
    if (!pill) return;
    const offline = !navigator.onLine || Boolean(state.remoteError);
    pill.classList.toggle('offline', offline);
    const label = pill.querySelector('span:last-child');
    if (label) label.textContent = offline ? 'Sin conexión' : 'En línea';
    pill.title = state.remoteError || (navigator.onLine ? 'Conexión disponible' : 'No hay conexión a internet');
  }

  App.updateNetworkPill = updateNetworkPill;

  function renderJavaChip() {
    const chip = $('#java-chip');
    const text = $('#java-chip-text');
    if (!chip || !text) return;
    const java = javaForVersion(selectedVersion());
    if (!state.java.length) {
      text.textContent = state.javaReady ? 'Java no detectado' : 'Buscando Java…';
      chip.title = state.javaReady
        ? 'No se encontró ninguna instalación de Java. Puedes elegir una manualmente en Ajustes → Java.'
        : 'Detectando instalaciones de Java en el sistema…';
      return;
    }
    if (java) {
      text.textContent = `Java ${java.major}`;
      chip.title = `${java.vendor || 'Java'} ${java.version}\n${java.path}`;
    }
  }

  App.renderJavaChip = renderJavaChip;
  App.refreshJava = () => {
    renderJavaChip();
    App.home?.renderJava?.();
    App.settings?.renderJava?.();
  };

  /* ---------------------------------------------------------------------- */
  /*                             Sesión y perfiles                          */
  /* ---------------------------------------------------------------------- */

  async function handleLogin(event) {
    event.preventDefault();
    const input = $('#login-username');
    const errorBox = $('#login-error');
    const submit = $('#login-submit');
    const name = String(input?.value || '').trim();

    errorBox.hidden = true;
    if (!USERNAME_RE.test(name)) {
      errorBox.textContent = 'El nombre debe tener entre 3 y 16 caracteres. Solo letras, números y guion bajo (_).';
      errorBox.hidden = false;
      input?.focus();
      return;
    }

    setBusy(submit, true, 'Entrando…');
    try {
      const result = await api.accounts.add(name);
      updateAuth(result);
      state.settings.seenWelcome = true;
      enterApp();
      App.home?.render?.();
      toast(`Bienvenido, ${state.account?.name || name}. Ya puedes jugar con tu cuenta offline.`, 'success', 'Sesión iniciada');
    } catch (error) {
      const message = errorMessage(error);
      errorBox.textContent = message;
      errorBox.hidden = false;
    } finally {
      setBusy(submit, false);
    }
  }

  function randomName() {
    const starts = ['Nexy', 'Craft', 'Pixel', 'Block', 'Sky', 'Ender', 'Red', 'Luna', 'Turbo', 'Shadow', 'Iron', 'Neon', 'Pro', 'Mega', 'Diamond'];
    const ends = ['Player', 'Wolf', 'Miner', 'Crafter', 'Fox', 'Ghost', 'Knight', 'Storm', 'Bolt', 'Builder', 'Ninja', 'Tiger', 'Hero', 'Sparks', 'Stone'];
    const name = `${starts[Math.floor(Math.random() * starts.length)]}${ends[Math.floor(Math.random() * ends.length)]}`.slice(0, 16);
    const input = $('#login-username');
    if (input) {
      input.value = name;
      input.focus();
    }
    const error = $('#login-error');
    if (error) error.hidden = true;
  }

  function openAccountModal() {
    if (!state.account) {
      toast('Inicia sesión para gestionar tu perfil.', 'warning');
      return;
    }
    const current = state.account;
    const others = state.accounts.filter((account) => account.id !== current.id);

    const rows = others.map((account) => `
      <div class="account-row">
        <span class="avatar">${avatarSvg(account.name)}</span>
        <span class="account-row-name" title="${esc(account.name)}">${esc(account.name)}</span>
        <button class="btn btn-ghost btn-sm" data-account-activate="${esc(account.id)}">Usar</button>
        <button class="action-btn danger" data-account-remove="${esc(account.id)}" title="Eliminar perfil">${icon('trash')}</button>
      </div>`).join('');

    const modal = openModal(`
      <div class="modal-head">
        <div><span class="eyebrow">TU PERFIL</span><h2>Cuenta y perfiles</h2><p>Cambia de jugador sin cerrar el launcher. Todas las cuentas son offline.</p></div>
        <button class="icon-btn modal-close" data-modal-close aria-label="Cerrar">${icon('x')}</button>
      </div>
      <div class="account-hero">
        <span class="avatar avatar-lg">${avatarSvg(current.name)}</span>
        <div class="account-hero-copy"><strong>${esc(current.name)}</strong><small>${icon('shield')} Cuenta offline · creado ${formatDate(current.createdAt)}</small></div>
        <span class="badge badge-soft">Activo</span>
        <button class="action-btn danger" data-account-remove="${esc(current.id)}" title="Eliminar este perfil">${icon('trash')}</button>
      </div>
      ${others.length ? `
        <div class="account-list">
          <div class="account-list-label"><span>Otros perfiles</span><span>${others.length}</span></div>
          ${rows}
        </div>` : ''}
      <div class="account-add">
        <input id="account-new-name" class="text-input" maxlength="16" placeholder="Nuevo nombre de jugador" autocomplete="off" spellcheck="false">
        <button class="btn btn-primary" id="account-add-btn">Añadir</button>
      </div>
      <p class="form-error" id="account-add-error" hidden></p>
      <div class="settings-link"><span>Los perfiles se guardan en este equipo.</span><button class="link-btn" data-goto="settings" data-modal-close>Ajustes</button></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" id="account-logout">${icon('logout')}Cerrar sesión</button>
        <button class="btn btn-primary" data-modal-close>Listo</button>
      </div>`);

    const add = async () => {
      const input = $('#account-new-name');
      const error = $('#account-add-error');
      const name = String(input?.value || '').trim();
      error.hidden = true;
      if (!USERNAME_RE.test(name)) {
        error.textContent = 'Usa entre 3 y 16 caracteres: letras, números o guion bajo.';
        error.hidden = false;
        return;
      }
      const button = $('#account-add-btn');
      setBusy(button, true, 'Añadiendo…');
      try {
        const result = await api.accounts.add(name);
        updateAuth(result);
        closeModal();
        toast(`Perfil ${state.account?.name || name} activado.`, 'success', 'Perfil añadido');
        App.home?.render?.();
      } catch (error_) {
        error.textContent = errorMessage(error_);
        error.hidden = false;
        setBusy(button, false);
      }
    };

    $('#account-add-btn').addEventListener('click', add);
    $('#account-new-name').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        add();
      }
    });

    modal.querySelectorAll('[data-account-activate]').forEach((button) => {
      button.addEventListener('click', async () => {
        setBusy(button, true);
        try {
          const result = await api.accounts.activate(button.dataset.accountActivate);
          updateAuth(result);
          closeModal();
          toast(`Ahora juegas como ${state.account?.name || 'jugador'}.`, 'success', 'Perfil activo');
          App.home?.render?.();
        } catch (error) {
          toastError(errorMessage(error));
          setBusy(button, false);
        }
      });
    });

    modal.querySelectorAll('[data-account-remove]').forEach((button) => {
      button.addEventListener('click', () => removeAccount(button.dataset.accountRemove));
    });

    $('#account-logout').addEventListener('click', async () => {
      if (state.launch.active) {
        toast('Cierra Minecraft antes de cerrar la sesión.', 'warning');
        return;
      }
      const logoutButton = $('#account-logout');
      setBusy(logoutButton, true, 'Saliendo…');
      try {
        const result = await api.accounts.logout();
        const name = state.account?.name || 'jugador';
        updateAuth(result);
        closeModal();
        showLogin();
        toast(`Has cerrado la sesión de ${name}. Tu perfil sigue guardado.`, 'info', 'Sesión cerrada');
      } catch (error) {
        toastError(errorMessage(error));
        setBusy(logoutButton, false);
      }
    });
  }

  async function removeAccount(id) {
    const account = state.accounts.find((item) => item.id === id);
    if (!account) return;
    closeModal();
    const accepted = await confirmDialog({
      title: `¿Eliminar a ${account.name}?`,
      message: 'Se borrará este perfil del launcher. Tus mundos y partidas guardadas no se tocan.',
      confirm: 'Eliminar perfil',
      icon: 'trash'
    });
    if (!accepted) {
      openAccountModal();
      return;
    }
    try {
      const result = await api.accounts.remove(id);
      updateAuth(result);
      if (state.account) {
        openAccountModal();
        App.home?.render?.();
      } else {
        showLogin();
      }
      toast(`Perfil ${account.name} eliminado.`, 'success');
    } catch (error) {
      toastError(errorMessage(error));
    }
  }

  App.openAccountModal = openAccountModal;

  /* ---------------------------------------------------------------------- */
  /*                              Enlaces y atajos                          */
  /* ---------------------------------------------------------------------- */

  function bindShell() {
    $('#btn-min')?.addEventListener('click', () => api.window.minimize());
    $('#btn-max')?.addEventListener('click', () => api.window.toggleMaximize());
    $('#btn-close')?.addEventListener('click', () => api.window.close());

    $('.titlebar-drag')?.addEventListener('dblclick', () => api.window.toggleMaximize());
    api.window.onMaximized?.((maximized) => {
      const maxIcon = $('#icon-max');
      if (maxIcon) maxIcon.querySelector('use')?.setAttribute('href', maximized ? '#i-restore' : '#i-maximize');
      $('#btn-max')?.setAttribute('title', maximized ? 'Restaurar' : 'Maximizar');
      $('#btn-max')?.setAttribute('aria-label', maximized ? 'Restaurar' : 'Maximizar');
    });

    $$('.rail-btn').forEach((button) => {
      button.addEventListener('click', () => go(button.dataset.page));
    });

    document.addEventListener('click', (event) => {
      const goto = event.target.closest('[data-goto]');
      if (goto) {
        closeModal();
        go(goto.dataset.goto);
        return;
      }
      const external = event.target.closest('[data-external]');
      if (external) {
        event.preventDefault();
        api.openExternal(external.dataset.external).catch((error) => toastError(errorMessage(error), 'No se pudo abrir el enlace'));
        return;
      }
      const feedback = event.target.closest('[data-feedback]');
      if (feedback) {
        event.preventDefault();
        const kind = feedback.dataset.feedback;
        if (kind === 'diagnostics') copyDiagnostics();
        else if (kind === 'logs') openLogs();
        else openFeedback(kind);
      }
    });

    $('#modal-overlay')?.addEventListener('click', (event) => {
      if (event.target.id === 'modal-overlay' || event.target.closest('[data-modal-close]')) closeModal();
    });

    $('#btn-account-top')?.addEventListener('click', openAccountModal);
    $('#btn-account-rail')?.addEventListener('click', openAccountModal);
    $('#btn-top-console')?.addEventListener('click', () => App.launch?.openConsole?.());
    $('#session-chip')?.addEventListener('click', () => App.launch?.openConsole?.());

    window.addEventListener('online', updateNetworkPill);
    window.addEventListener('offline', updateNetworkPill);

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        if (!$('#modal-overlay').hidden) {
          closeModal();
          return;
        }
        if (!$('#console-drawer').hidden) {
          App.launch?.closeConsole?.();
          return;
        }
        if (!$('#launch-dock').hidden) App.launch?.hideDock?.();
        return;
      }

      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.isContentEditable;
      if (event.ctrlKey && !event.altKey && !event.metaKey) {
        const pages = ['home', 'instances', 'mods', 'servers', 'content', 'ai', 'settings'];
        const number = Number(event.key);
        if (number >= 1 && number <= pages.length) {
          event.preventDefault();
          go(pages[number - 1]);
          return;
        }
        if (event.key.toLowerCase() === 'j') {
          event.preventDefault();
          App.launch?.openConsole?.();
        }
      }
      if (event.key === 'Escape' && typing) event.target.blur();
    });
  }

  function bindLogin() {
    $('#login-form')?.addEventListener('submit', handleLogin);
    $('#btn-random-name')?.addEventListener('click', randomName);
    $('#login-username')?.addEventListener('input', () => {
      const error = $('#login-error');
      if (error) error.hidden = true;
    });
  }

  /* ---------------------------------------------------------------------- */
  /*                                 Arranque                               */
  /* ---------------------------------------------------------------------- */

  App.start = async function start() {
    bindShell();
    bindLogin();
    updateNetworkPill();
    applyTheme('violet');

    try {
      const data = await api.init();
      state.settings = data.settings || {};
      state.accounts = Array.isArray(data.accounts) ? data.accounts : [];
      state.account = data.activeAccount || null;
      state.servers = Array.isArray(data.servers) ? data.servers : [];
      state.localVersions = Array.isArray(data.localVersions) ? data.localVersions : [];
      state.mods = Array.isArray(data.mods) ? data.mods : [];
      state.instances = Array.isArray(data.instances)
        ? data.instances
        : Array.isArray(data.settings?.instances)
          ? data.settings.instances
          : [];
      state.activeInstanceId = data.activeInstanceId || data.settings?.activeInstanceId || null;
      state.java = Array.isArray(data.java) ? data.java : [];
      state.javaReady = state.java.length > 0;
      state.system = data.system || {};
      state.paths = data.paths || {};
      state.loader = state.settings.lastLoader || 'vanilla';
      state.loaderVersion = state.settings.lastLoaderVersion || '';
      const startupInstance = state.instances.find((instance) => instance.id === state.activeInstanceId) || state.instances[0] || null;
      state.modLoaderFilter = startupInstance && startupInstance.loader && startupInstance.loader !== 'vanilla'
        ? startupInstance.loader
        : '';
      state.modProvider = state.settings.modProvider || 'modrinth';
      state.loaded = true;

      App.i18n?.init?.();

      applyTheme(state.settings.theme);
      renderAccountUI();
      renderSavedAccounts();
      renderJavaChip();

      App.home?.init?.();
      App.instances?.init?.();
      App.mods?.init?.();
      App.servers?.init?.();
      App.content?.init?.();
      App.ai?.init?.();
      App.updates?.init?.();
      App.settings?.init?.();

      App.home?.render?.();
      App.instances?.render?.();
      App.mods?.render?.();
      App.servers?.render?.();
      App.content?.render?.();
      App.ai?.render?.();
      App.updates?.render?.();
      App.settings?.render?.();

      let javaWarned = false;
      const applyJava = (list) => {
        state.java = Array.isArray(list) ? list : [];
        state.javaReady = true;
        App.refreshJava();
        if (!state.java.length && !javaWarned) {
          javaWarned = true;
          toast('No se detectó Java. Instálalo o elige una ruta manual en Ajustes → Java.', 'warning', 'Java no encontrado');
        }
      };
      api.onJavaUpdate(applyJava);
      api.java.detect().then(applyJava).catch((error) => {
        state.javaReady = true;
        App.refreshJava();
        console.warn('No se pudo detectar Java:', error);
      });

      api.onLaunchEvent((payload) => App.launch?.handle?.(payload));
      api.onModsProgress?.((payload) => App.mods?.onProgress?.(payload));

      const status = await api.launch.status().catch(() => null);
      if (status?.running || status?.preparing) App.launch?.restore?.(status);

      if (state.settings.autoLogin !== false && state.account) {
        enterApp();
      } else {
        showLogin();
      }

      App.home?.loadRemote?.(false);
      App.updates?.check?.(false);
    } catch (error) {
      console.error('Error al iniciar el launcher:', error);
      showLogin();
      const errorBox = $('#login-error');
      if (errorBox) {
        errorBox.textContent = `No se pudo cargar la configuración: ${errorMessage(error)}`;
        errorBox.hidden = false;
      }
      toastError(errorMessage(error), 'Error de inicio');
    }
  };
})();
