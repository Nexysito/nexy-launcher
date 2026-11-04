'use strict';

/* NexyLauncher 1.0 — inicio, lanzamiento, consola y servidores rápidos. */
(() => {
  const App = window.NexyApp;
  const api = App.api;
  const { $, $$, esc, icon, state, toast, toastError } = App;

  const STATUS_TITLES = {
    checking: 'Preparando Minecraft',
    installing: 'Instalando cargador',
    preparing: 'Preparando Minecraft',
    downloading: 'Descargando Minecraft',
    starting: 'Iniciando Minecraft',
    running: 'Minecraft en ejecución',
    stopping: 'Deteniendo Minecraft',
    closed: 'Sesión finalizada',
    error: 'No se pudo iniciar Minecraft'
  };

  const NEWS = [
    { icon: 'sparkles', title: 'Asistente de ayuda', text: 'Chat integrado para resolver dudas, revisar crashes y aplicar arreglos automáticos.', goto: 'ai' },
    { icon: 'grid', title: 'Integración de Modrinth', text: 'Busca, instala y actualiza mods desde Modrinth en cada instancia.', goto: 'mods' },
    { icon: 'message', title: 'Comunidad y feedback', text: 'Formulario, contacto por Discord, diagnóstico y logs desde Inicio y Ajustes.', goto: 'settings' }
  ];

  function remoteVersion(id) {
    return state.remote?.versions?.find((version) => version.id === id) || null;
  }

  function sortedInstalled() {
    return state.localVersions.slice().sort((a, b) => String(b.releaseTime || b.modified || '').localeCompare(String(a.releaseTime || a.modified || '')));
  }

  function buildVersionOptions() {
    const select = $('#version-select');
    if (!select) return;
    const installed = sortedInstalled().filter((version) => App.isBaseVersion(version));
    const installedIds = new Set(installed.map((version) => version.id));
    const settings = state.settings || {};
    const releases = (state.remote?.versions || [])
      .filter((version) => version.type === 'release' && !installedIds.has(version.id))
      .slice(0, 18);
    const snapshots = settings.showSnapshots
      ? (state.remote?.versions || []).filter((version) => version.type === 'snapshot' && !installedIds.has(version.id)).slice(0, 4)
      : [];

    const parts = [];
    if (installed.length) {
      parts.push(`<optgroup label="Instaladas">${installed.map((version) => `<option value="${esc(version.id)}">${esc(version.id)} · instalada</option>`).join('')}</optgroup>`);
    }
    const available = [...releases, ...snapshots];
    const assigned = settings.lastVersion;
    if (assigned && !installedIds.has(assigned) && !available.some((version) => version.id === assigned)) {
      parts.push(`<option value="${esc(assigned)}">${esc(assigned)} · asignada</option>`);
    }
    if (available.length) {
      parts.push(`<optgroup label="Disponibles">${available.map((version) => `<option value="${esc(version.id)}">${esc(version.id)} · ${esc(App.typeLabel(version.type))}</option>`).join('')}</optgroup>`);
    }
    if (!parts.length) {
      parts.push('<option value="">No hay versiones disponibles</option>');
    }
    select.innerHTML = parts.join('');

    const values = [...select.options].map((option) => option.value).filter(Boolean);
    const preferred = [settings.lastVersion, installed[0]?.id, values[0]].find((value) => value && values.includes(value));
    select.value = preferred || values[0] || '';
    select.disabled = values.length === 0;
  }

  function loaderVersionId(loader, mcVersion, loaderVersion) {
    if (!loader || loader === 'vanilla' || !mcVersion || !loaderVersion) return '';
    if (loader === 'fabric') return `fabric-loader-${loaderVersion}-${mcVersion}`;
    if (loader === 'quilt') return `quilt-loader-${loaderVersion}-${mcVersion}`;
    if (loader === 'forge') return `${mcVersion}-forge-${loaderVersion}`;
    if (loader === 'neoforge') return mcVersion === '1.20.1' ? `${mcVersion}-forge-${loaderVersion}` : `neoforge-${loaderVersion}`;
    return '';
  }

  function currentLoader() {
    return $('#loader-select')?.value || state.loader || 'vanilla';
  }

  function currentLoaderVersion() {
    return $('#loader-version-select')?.value || '';
  }

  function activeInstanceEntry() {
    return state.instances.find((instance) => instance.id === state.activeInstanceId) || state.instances[0] || null;
  }

  function applyLoaderVersion(value) {
    const next = value || '';
    const previous = state.settings?.lastLoaderVersion || '';
    state.loaderVersion = next;
    if (state.settings) state.settings.lastLoaderVersion = next;
    const active = activeInstanceEntry();
    if (active) active.loaderVersion = next;
    if (previous !== next) {
      App.instances?.render?.();
      api.settings.save({ lastLoaderVersion: next }).catch(() => {});
    }
  }

  function selectedLoaderInstalled(mcVersion, loader, loaderVersion) {
    if (!loader || loader === 'vanilla' || !loaderVersion) return false;
    const id = loaderVersionId(loader, mcVersion, loaderVersion);
    return Boolean(id && state.localVersions.some((version) => version.id === id));
  }

  function renderLoaderHint() {
    const hint = $('#loader-hint');
    const field = $('#loader-version-field');
    if (!hint || !field) return;
    const loader = currentLoader();
    const mcVersion = $('#version-select')?.value || '';
    hint.classList.remove('warn');
    field.hidden = loader === 'vanilla';

    if (loader === 'vanilla') {
      hint.textContent = 'Solo Minecraft Vanilla. Elige un cargador para usar mods.';
      return;
    }
    if (state.loaderLoading) {
      hint.textContent = `Buscando versiones de ${App.loaderLabel(loader)} para ${mcVersion}…`;
      return;
    }
    if (state.loaderError) {
      hint.textContent = state.loaderError;
      hint.classList.add('warn');
      return;
    }
    const loaderVersion = currentLoaderVersion();
    if (!loaderVersion) {
      hint.textContent = `Elige una versión de ${App.loaderLabel(loader)}.`;
      return;
    }
    if (selectedLoaderInstalled(mcVersion, loader, loaderVersion)) {
      hint.textContent = `${App.loaderLabel(loader)} ${loaderVersion} ya está instalado para ${mcVersion}.`;
    } else {
      hint.textContent = `${App.loaderLabel(loader)} ${loaderVersion} se instalará automáticamente al pulsar Jugar.`;
    }
  }

  function renderSelectedVersion() {
    const select = $('#version-select');
    const version = select?.value || '';
    const installed = state.localVersions.find((item) => item.id === version);
    const remote = remoteVersion(version);
    const type = installed?.type || remote?.type || 'release';
    const required = App.requiredJava(version);
    const best = App.javaForVersion(version);
    const loader = currentLoader();
    const loaderVersion = currentLoaderVersion();
    const play = $('#btn-play');

    if (play) {
      play.disabled = !version || !state.account;
      play.title = !version ? 'Elige una versión para jugar' : `Jugar Minecraft ${version}${loader !== 'vanilla' ? ` con ${App.loaderLabel(loader)}` : ''}`;
    }

    const setText = (selector, value) => {
      const element = $(selector);
      if (element) element.textContent = value;
    };

    let flavor;
    let statusLabel;
    if (loader !== 'vanilla') {
      const loaderInstalled = selectedLoaderInstalled(version, loader, loaderVersion);
      flavor = `${App.loaderLabel(loader)}${loaderVersion ? ` ${loaderVersion}` : ''}`;
      statusLabel = loaderInstalled ? 'Cargador instalado' : loaderVersion ? 'Se instalará al jugar' : 'Cargador sin elegir';
    } else {
      flavor = installed?.loader
        ? `${installed.loader}${installed.base ? ` · base ${installed.base}` : ''}`
        : App.typeLabel(type);
      statusLabel = installed ? (installed.complete ? 'Instalada' : 'Archivos incompletos') : version ? 'Se descargará al jugar' : 'Sin versión';
    }

    setText('#play-sub', version ? `${version} · ${flavor}` : 'Sin versión seleccionada');
    setText('#hero-meta-type', flavor);
    setText('#hero-meta-status', statusLabel);
    setText('#hero-meta-java', best ? (best.major >= required ? `Java ${best.major} listo` : `Java ${required}+ requerido`) : state.javaReady ? `Java ${required}+ requerido` : 'Buscando Java…');

    const status = $('#hero-meta-status');
    if (status) status.closest('span')?.classList.toggle('warn', Boolean((installed && !installed.complete) || (loader !== 'vanilla' && !selectedLoaderInstalled(version, loader, loaderVersion))));
    renderLoaderHint();
  }

  function fillLoaderVersionOptions(data) {
    const select = $('#loader-version-select');
    if (!select) return;
    const versions = Array.isArray(data?.versions) ? data.versions : [];
    if (!versions.length) {
      select.innerHTML = '<option value="">Sin versiones compatibles</option>';
      select.disabled = true;
      state.loaderError = `${App.loaderLabel(data?.loader || currentLoader())} no tiene versiones para esta versión de Minecraft.`;
      renderLoaderHint();
      return;
    }

    const preferred = [state.loaderVersion, data.defaultVersion, versions[0].version]
      .find((value) => value && versions.some((item) => item.version === value));
    select.innerHTML = versions.map((item) => {
      const tags = [];
      if (item.installed) tags.push('instalada');
      if (item.recommended) tags.push('recomendada');
      else if (item.latest) tags.push('última');
      if (item.stable === false) tags.push('beta');
      return `<option value="${esc(item.version)}">${esc(item.version)}${tags.length ? ` · ${esc(tags.join(' · '))}` : ''}</option>`;
    }).join('');
    select.value = preferred || versions[0].version;
    select.disabled = false;
    applyLoaderVersion(select.value);
    state.loaderError = null;
    renderSelectedVersion();
  }

  async function loadLoaderVersions(force = false) {
    const loader = currentLoader();
    const mcVersion = $('#version-select')?.value || '';
    const select = $('#loader-version-select');
    if (!select) return;

    if (loader === 'vanilla' || !mcVersion) {
      state.loaderLoading = false;
      state.loaderError = null;
      renderLoaderHint();
      return;
    }

    const key = `${loader}:${mcVersion}`;
    const cached = state.loaderVersions[key];
    if (!force && cached) {
      fillLoaderVersionOptions(cached);
      return;
    }

    const request = ++state.loaderRequest;
    state.loaderLoading = true;
    state.loaderError = null;
    select.disabled = true;
    select.innerHTML = '<option value="">Cargando versiones…</option>';
    renderLoaderHint();

    try {
      const data = await api.loaders.versions({ loader, mcVersion, force });
      if (request !== state.loaderRequest) return;
      state.loaderVersions[key] = data;
      state.loaderLoading = false;
      fillLoaderVersionOptions(data);
    } catch (error) {
      if (request !== state.loaderRequest) return;
      state.loaderLoading = false;
      state.loaderError = App.errorMessage(error);
      select.innerHTML = '<option value="">No disponible</option>';
      select.disabled = true;
      renderLoaderHint();
      renderSelectedVersion();
    }
  }

  function syncLoaderControls() {
    const loaderSelect = $('#loader-select');
    if (!loaderSelect) return;
    const loader = state.loader || 'vanilla';
    loaderSelect.value = loader;
    const field = $('#loader-version-field');
    if (field) field.hidden = loader === 'vanilla';

    if (loader === 'vanilla') {
      state.loaderLoading = false;
      state.loaderError = null;
      renderLoaderHint();
      return;
    }

    const mcVersion = $('#version-select')?.value || '';
    const key = `${loader}:${mcVersion}`;
    if (mcVersion && state.loaderVersions[key]) {
      fillLoaderVersionOptions(state.loaderVersions[key]);
    } else if (mcVersion && !state.loaderLoading) {
      loadLoaderVersions(false);
    } else {
      renderLoaderHint();
    }
  }

  function renderStats() {
    const settings = App.effectiveSettings ? App.effectiveSettings() : (state.settings || {});
    const memory = settings.memory || { min: 2, max: 4 };
    const java = App.javaForVersion(App.selectedVersion());
    const totalMods = state.mods.length;
    const enabledMods = state.mods.filter((mod) => mod.enabled).length;

    const setText = (selector, value) => {
      const element = $(selector);
      if (element) element.textContent = value;
    };

    const active = App.activeInstanceEntry ? App.activeInstanceEntry() : null;
    setText('#stat-memory', `${memory.min}–${memory.max} GB`);
    setText('#stat-memory-sub', active?.settings?.memory
      ? 'memoria propia de la instancia'
      : state.system.totalMemory ? `de ${state.system.totalMemory} GB del sistema` : 'memoria asignada');
    setText('#stat-java', java ? `Java ${java.major}` : state.javaReady ? '—' : '…');
    setText('#stat-java-sub', java ? (java.vendor || 'Detectado') : state.javaReady ? 'No detectado' : 'Buscando…');
    setText('#stat-mods', String(totalMods));
    setText('#stat-mods-sub', totalMods ? `${enabledMods} activo${enabledMods === 1 ? '' : 's'}` : 'Carpeta mods vacía');
  }

  async function refreshLocalVersions() {
    try {
      state.localVersions = await api.versions.local();
      for (const [key, data] of Object.entries(state.loaderVersions)) {
        if (!data || !Array.isArray(data.versions)) continue;
        data.versions = data.versions.map((item) => ({
          ...item,
          installed: Boolean(item.id && state.localVersions.some((version) => version.id === item.id))
        }));
      }
      renderInstalled();
      renderStats();
      renderSelectedVersion();
    } catch {
      /* silencio */
    }
  }

  function renderLatestPill() {
    const pill = $('#pill-latest');
    if (!pill) return;
    const label = pill.querySelector('span');
    const latest = state.remote?.latest?.release || state.localVersions[0]?.id || '—';
    if (label) label.textContent = latest === '—' ? 'Catálogo pendiente' : `Última ${latest}`;
    pill.title = state.remote?.stale ? 'Catálogo guardado en caché' : 'Última versión estable de Minecraft';
  }

  function renderInstalled() {
    const host = $('#installed-list');
    if (!host) return;
    const installed = sortedInstalled();
    if (!installed.length) {
      host.innerHTML = `
        <div class="empty-inline">
          <p>No hay ninguna versión instalada. Elige una versión arriba y pulsa Jugar; se descargará automáticamente.</p>
        </div>`;
      return;
    }

    const rows = installed.map((version) => `
      <div class="version-row-compact">
        <span class="version-badge ${App.typeClass(version.type)}">${icon('layers')}</span>
        <div class="version-compact-main">
          <strong>${esc(version.id)}</strong>
          <small>${esc(version.loader ? `${version.loader}${version.base ? ` (${version.base})` : ''}` : App.typeLabel(version.type))}${version.complete ? '' : ' · archivos incompletos'} · ${esc(App.formatDate(version.releaseTime || version.modified))}</small>
        </div>
        <button class="icon-play" data-play-version="${esc(version.id)}" title="Jugar Minecraft ${esc(version.id)}">${icon('play')}</button>
      </div>`).join('');

    host.innerHTML = rows;

    $$('[data-play-version]', host).forEach((button) => {
      button.addEventListener('click', () => startGame('', button.dataset.playVersion));
    });
  }

  function renderNews() {
    const host = $('#news-list');
    if (!host) return;
    host.innerHTML = NEWS.map((item) => `
      <button class="news-item" ${item.goto ? `data-goto="${esc(item.goto)}"` : `data-external="${esc(item.url)}"`}>
        <span class="news-thumb">${icon(item.icon)}</span>
        <span class="news-copy"><strong>${esc(item.title)}</strong><small>${esc(item.text)}</small></span>
      </button>`).join('');
  }

  function renderQuickServers() {
    const empty = $('#quick-server-empty');
    const active = $('#quick-server-active');
    const select = $('#quick-server-select');
    if (!empty || !active || !select) return;

    if (!state.servers.length) {
      empty.hidden = false;
      active.hidden = true;
      return;
    }

    const previous = select.value;
    select.innerHTML = state.servers.map((server) => `<option value="${esc(server.id)}">${esc(server.name)} — ${esc(server.address)}</option>`).join('');
    if (state.servers.some((server) => server.id === previous)) select.value = previous;
    empty.hidden = true;
    active.hidden = false;
  }

  function renderJava() {
    const java = App.javaForVersion(App.selectedVersion());
    const chip = $('#java-chip');
    const setText = (selector, value) => {
      const element = $(selector);
      if (element) element.textContent = value;
    };
    setText('#stat-java', java ? `Java ${java.major}` : '—');
    setText('#stat-java-sub', java ? (java.vendor || 'Detectado') : 'No detectado');
    renderSelectedVersion();
    if (chip && state.java.length && java) chip.title = `${java.vendor || 'Java'} ${java.version}\n${java.path}`;
  }

  async function loadRemote(force = false) {
    if (!state.settings || state.remoteLoading) return;
    if (!force && state.remote) {
      render();
      return;
    }
    if (!force && state.remoteRequested) {
      render();
      return;
    }

    state.remoteRequested = true;
    state.remoteLoading = true;
    state.remoteError = null;
    render();
    App.updateNetworkPill?.();

    try {
      const data = await api.versions.remote(force === true);
      state.remote = data;
      if (data?.error) state.remoteError = data.error;
      App.updateNetworkPill?.();
    } catch (error) {
      state.remoteError = App.errorMessage(error);
      state.remoteRequested = false;
      App.updateNetworkPill?.();
    } finally {
      state.remoteLoading = false;
      render();
      App.mods?.render?.();
    }
  }

  function render() {
    if (!state.settings) return;
    const instanceName = $('#hero-instance-name');
    if (instanceName) {
      const active = state.instances.find((instance) => instance.id === state.activeInstanceId) || state.instances[0];
      instanceName.textContent = active?.name || 'Principal';
    }
    buildVersionOptions();
    syncLoaderControls();
    renderSelectedVersion();
    renderStats();
    renderLatestPill();
    renderInstalled();
    renderNews();
    renderQuickServers();
    renderJava();
    App.updateNetworkPill?.();
  }

  /* ---------------------------------------------------------------------- */
  /*                            Consola de salida                           */
  /* ---------------------------------------------------------------------- */

  function consoleElement() {
    return $('#console-output');
  }

  function updateConsoleStatus(label) {
    const status = $('#console-status');
    if (status) status.textContent = label || (state.launch.active ? 'Minecraft en marcha' : 'En espera');
  }

  function appendConsole(text) {
    const output = consoleElement();
    if (!output) return;
    const nearBottom = output.scrollHeight - output.scrollTop - output.clientHeight < 60;
    const node = document.createTextNode(`${text}\n`);
    output.appendChild(node);
    while (output.textContent.length > 500000) {
      output.removeChild(output.firstChild);
    }
    if (nearBottom) output.scrollTop = output.scrollHeight;
  }

  function clearConsole() {
    const output = consoleElement();
    if (output) output.textContent = '';
    state.launch.logs = [];
  }

  function openConsole() {
    $('#console-drawer').hidden = false;
    updateConsoleStatus();
    const output = consoleElement();
    if (output) output.scrollTop = output.scrollHeight;
  }

  function closeConsole() {
    $('#console-drawer').hidden = true;
  }

  async function copyConsole() {
    const text = consoleElement()?.textContent || '';
    if (!text.trim()) {
      toast('La consola está vacía todavía.', 'info');
      return;
    }
    if (await App.copyText(text)) {
      toast('Contenido de la consola copiado al portapapeles.', 'success');
    }
  }

  /* ---------------------------------------------------------------------- */
  /*                              Launch dock                               */
  /* ---------------------------------------------------------------------- */

  function showDock() {
    clearDockTimer();
    $('#launch-dock').hidden = false;
  }

  function hideDock() {
    $('#launch-dock').hidden = true;
  }

  function setPhase(phase, title, detail, percent) {
    const dock = $('#launch-dock');
    if (!dock) return;
    dock.hidden = false;
    dock.dataset.phase = phase;
    const titleElement = $('#launch-title');
    const detailElement = $('#launch-detail');
    if (titleElement && title) titleElement.textContent = title;
    if (detailElement && detail !== undefined) detailElement.textContent = detail;
    if (typeof percent === 'number') setProgress(percent);
    const stop = $('#btn-launch-stop');
    if (stop) stop.hidden = !state.launch.active || phase === 'closed' || phase === 'error';
    updateConsoleStatus();
  }

  function setProgress(percent) {
    const value = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    const bar = $('#launch-progress');
    const label = $('#launch-percent');
    if (bar) bar.style.width = `${value}%`;
    if (label) label.textContent = value > 0 ? `${value}%` : '';
  }

  function clearDockTimer() {
    if (state.launch.timer) {
      clearTimeout(state.launch.timer);
      state.launch.timer = null;
    }
  }

  function sessionChip(text) {
    const chip = $('#session-chip');
    const label = $('#session-chip-text');
    if (!chip) return;
    if (!text) {
      chip.hidden = true;
      return;
    }
    chip.hidden = false;
    if (label) label.textContent = text;
  }

  function updateSessionChip(phase) {
    if (phase === 'running') sessionChip('Jugando');
    else if (phase === 'installing') sessionChip('Instalando');
    else if (phase === 'starting') sessionChip('Iniciando');
    else if (phase === 'downloading') sessionChip('Descargando');
    else if (phase === 'stopping') sessionChip('Cerrando');
    else if (phase === 'closed' || phase === 'error') sessionChip('');
    else sessionChip('Preparando');
  }

  function setPlaySub(text) {
    const play = $('#play-sub');
    if (play) play.textContent = text;
  }

  function handle(payload) {
    if (!payload || !payload.type) return;

    if (payload.type === 'start') {
      clearDockTimer();
      state.launch.active = true;
      state.launch.version = payload.version;
      state.launch.server = payload.server || null;
      state.launch.loader = payload.loader || 'vanilla';
      state.launch.loaderVersion = payload.loaderVersion || null;
      state.launch.phase = 'checking';
      clearConsole();
      $('#console-drawer').hidden = true;
      const loaderLabel = payload.loader && payload.loader !== 'vanilla'
        ? ` con ${App.loaderLabel(payload.loader)}${payload.loaderVersion ? ` ${payload.loaderVersion}` : ''}`
        : '';
      setPhase('checking', `Preparando Minecraft ${payload.version}${loaderLabel}`, 'Comprobando Java y archivos del juego…', 3);
      updateSessionChip('checking');
      setPlaySub(`Preparando ${payload.version}…`);
      appendConsole(`NexyLauncher — iniciando Minecraft ${payload.version}${loaderLabel}${payload.server ? ` en ${payload.server}` : ''}`);
      return;
    }

    if (payload.type === 'install') {
      clearDockTimer();
      state.launch.phase = 'installing';
      const percent = Number.isFinite(payload.percent) ? payload.percent : undefined;
      setPhase('installing', STATUS_TITLES.installing, payload.message || 'Preparando el cargador…', percent);
      updateSessionChip('installing');
      setPlaySub('Instalando cargador…');
      return;
    }

    if (payload.type === 'resolved') {
      state.launch.version = payload.version || state.launch.version;
      state.launch.loader = payload.loader || state.launch.loader;
      state.launch.loaderVersion = payload.loaderVersion || state.launch.loaderVersion;
      const label = payload.loader && payload.loader !== 'vanilla'
        ? `${App.loaderLabel(payload.loader)}${payload.loaderVersion ? ` ${payload.loaderVersion}` : ''}`
        : 'Vanilla';
      appendConsole(`Versión de lanzamiento: ${state.launch.version} · ${label}`);
      setPhase('preparing', 'Preparando Minecraft', `${label} listo. Comprobando Java…`, 8);
      refreshLocalVersions();
      return;
    }

    if (payload.type === 'java-required') {
      openJavaRequired(payload);
      return;
    }

    if (payload.type === 'crash') {
      App.ai?.onCrash?.(payload.crash);
      return;
    }

    if (payload.type === 'log') {
      const message = String(payload.message || '');
      if (!message) return;
      for (const line of message.split(/\r?\n/)) {
        if (!line.trim()) continue;
        state.launch.logs.push(line);
        appendConsole(line);
      }
      if (state.launch.logs.length > 4000) state.launch.logs.splice(0, state.launch.logs.length - 4000);
      return;
    }

    if (payload.type === 'progress') {
      clearDockTimer();
      const percent = Number.isFinite(payload.percent) ? payload.percent : 0;
      setPhase('downloading', STATUS_TITLES.downloading, payload.total ? `${payload.label} · ${payload.task}/${payload.total}` : payload.label, percent);
      updateSessionChip('downloading');
      return;
    }

    if (payload.type === 'download') {
      const detail = payload.percent !== null && payload.percent !== undefined
        ? `${payload.label}: ${payload.file} · ${payload.percent}%`
        : `${payload.label}: ${payload.file}`;
      const detailElement = $('#launch-detail');
      if (detailElement) detailElement.textContent = detail;
      return;
    }

    if (payload.type === 'status') {
      applyStatus(payload);
    }
  }

  function applyStatus(payload) {
    const { status, message, code } = payload;
    state.launch.phase = status;
    const version = state.launch.version || '';

    if (status === 'closed') {
      state.launch.active = false;
      clearDockTimer();
      setPhase('closed', STATUS_TITLES.closed, message || 'Minecraft se cerró correctamente.', 100);
      updateSessionChip('closed');
      renderSelectedVersion();
      sessionChip('');
      toast(message || 'Minecraft se cerró correctamente.', 'info', 'Sesión finalizada');
      state.launch.timer = setTimeout(hideDock, 6000);
      setTimeout(refreshLocalVersions, 1000);
      return;
    }

    if (status === 'error') {
      state.launch.active = false;
      clearDockTimer();
      setPhase('error', STATUS_TITLES.error, message || 'Revisa la consola para más detalles.', 100);
      updateSessionChip('error');
      sessionChip('');
      setPlaySub('Error al iniciar');
      toast(message || 'No se pudo iniciar Minecraft.', 'error', 'Error de lanzamiento');
      if (code === 'java' || code === 'launch') setTimeout(openConsole, 250);
      state.launch.timer = setTimeout(hideDock, 9000);
      return;
    }

    clearDockTimer();
    state.launch.active = status !== 'closed' && status !== 'error';
    const percent = status === 'running' || status === 'starting' ? 100 : undefined;
    const current = Number($('#launch-progress')?.style.width.replace('%', '')) || 0;
    setPhase(status, STATUS_TITLES[status] || 'Minecraft', message || '', percent ?? (status === 'checking' ? Math.max(3, current) : current));
    updateSessionChip(status);

    if (status === 'running') {
      setPlaySub(`Jugando ${version}…`);
      toast('Minecraft se está ejecutando. Puedes volver cuando quieras.', 'success', 'Todo listo');
    } else if (status === 'stopping') {
      setPlaySub('Deteniendo Minecraft…');
    } else if (status === 'starting') {
      setPlaySub(`Iniciando ${version}…`);
    } else if (status === 'installing') {
      setPlaySub('Instalando cargador…');
    } else if (status === 'downloading') {
      setPlaySub(`Descargando ${version}…`);
    }
  }

  function restore(status) {
    state.launch.active = true;
    state.launch.phase = status.phase || 'running';
    state.launch.version = status.version || '';
    showDock();
    setPhase(state.launch.phase, STATUS_TITLES[state.launch.phase] || 'Minecraft en marcha', 'Sesión detectada al abrir el launcher.', state.launch.phase === 'running' ? 100 : 0);
    updateSessionChip(state.launch.phase);
    setPlaySub(state.launch.phase === 'running' ? `Jugando ${state.launch.version}…` : `Preparando ${state.launch.version}…`);
    appendConsole('Se detectó una sesión de Minecraft en marcha.');
    updateConsoleStatus('Minecraft en marcha');
  }

  function openJavaRequired(info = {}) {
    const required = Number(info.required) || 21;
    const version = info.version || state.launch.version || 'Minecraft';
    const detected = Array.isArray(info.detected) ? info.detected : [];
    const majors = [...new Set(detected.map((item) => Number(item.major)).filter((major) => Number.isFinite(major)))].sort((a, b) => a - b);
    const available = majors.length ? majors.join(', ') : null;

    const modal = App.openModal(`
      <div class="modal-icon danger">${icon('coffee')}</div>
      ${App.modalHead('JAVA NECESARIO', `Falta Java ${required}`, `Minecraft ${version} no puede iniciarse con el Java detectado.`)}
      <p class="modal-text">Minecraft ${version} necesita <strong>Java ${required} o superior</strong>.${available ? ` Solo se detectó Java ${available}.` : ' No se encontró ninguna instalación de Java.'}</p>
      <p class="modal-text">Elige un Java ya instalado o descarga Java ${required} y elige la carpeta donde quieres instalarlo.</p>
      <div class="modal-actions modal-actions-wrap">
        <button class="btn btn-ghost" data-java-cancel>Cancelar</button>
        <button class="btn btn-ghost" data-java-pick>Elegir Java…</button>
        <button class="btn btn-primary" data-java-install>Instalar Java ${required}…</button>
      </div>
      <p class="help-text" data-java-status hidden></p>
    `);

    const status = modal.querySelector('[data-java-status]');
    const setStatus = (text) => {
      if (!status) return;
      status.hidden = !text;
      status.textContent = text || '';
    };

    const rememberJava = (java) => {
      if (!java || !java.path) return;
      if (!Array.isArray(state.java)) state.java = [];
      if (!state.java.some((item) => item.path === java.path)) {
        state.java = [java, ...state.java].sort((a, b) => b.major - a.major);
      }
      App.refreshJava?.();
    };

    const retry = () => {
      const request = state.launch.request || {};
      App.closeModal();
      toast(`Java ${required} listo. Iniciando Minecraft ${version}…`, 'success', 'Java configurado');
      setTimeout(() => startGame(request.server || '', request.versionOverride || '', {
        version: request.version || '',
        loader: request.loader || '',
        loaderVersion: request.loaderVersion || ''
      }), 350);
    };

    modal.querySelector('[data-java-cancel]')?.addEventListener('click', () => App.closeModal());

    modal.querySelector('[data-java-pick]')?.addEventListener('click', async () => {
      const button = modal.querySelector('[data-java-pick]');
      App.setBusy(button, true, 'Abriendo…');
      try {
        const result = await api.java.pick(required);
        if (!result || result.canceled) return;
        if (result.error) {
          toast(result.error, 'warning', 'Java no válido');
          return;
        }
        if (result.settings) state.settings = result.settings;
        rememberJava(result.java);
        retry();
      } catch (error) {
        toastError(App.errorMessage(error), 'No se pudo elegir Java');
      } finally {
        App.setBusy(button, false);
      }
    });

    modal.querySelector('[data-java-install]')?.addEventListener('click', async () => {
      const button = modal.querySelector('[data-java-install]');
      App.setBusy(button, true, 'Eligiendo carpeta…');
      let installing = false;
      const unsubscribe = api.onJavaInstallProgress?.((progress) => {
        if (!progress || Number(progress.major) !== required) return;
        if (!installing) {
          installing = true;
          App.setBusy(button, true, 'Instalando…');
        }
        if (progress.phase === 'download') {
          setStatus(progress.percent === null || progress.percent === undefined
            ? `Descargando Java ${required}…`
            : `Descargando Java ${required}… ${progress.percent}%`);
        } else if (progress.phase === 'extract') {
          setStatus(`Extrayendo Java ${required}…`);
        }
      });

      try {
        const result = await api.java.install(required);
        if (!result || result.canceled) {
          setStatus('');
          return;
        }
        if (result.settings) state.settings = result.settings;
        rememberJava(result.java);
        retry();
      } catch (error) {
        setStatus('');
        toastError(App.errorMessage(error), 'No se pudo instalar Java');
      } finally {
        unsubscribe?.();
        App.setBusy(button, false);
      }
    });
  }

  async function startGame(serverAddress = '', versionOverride = '', options = {}) {
    if (!state.account) {
      toast('Elige un perfil de jugador para poder jugar.', 'warning');
      App.showLogin();
      return;
    }
    const target = options.instance || null;
    const version = versionOverride || options.version || App.selectedVersion();
    if (!version) {
      toast('No hay ninguna versión seleccionada. Elige una versión en Inicio.', 'warning');
      return;
    }
    if (state.launch.active) {
      showDock();
      toast('Minecraft ya se está ejecutando desde este launcher.', 'warning');
      return;
    }

    const isOverride = Boolean(versionOverride);
    const loader = options.loader || (target ? (target.loader || 'vanilla') : (isOverride ? 'vanilla' : currentLoader()));
    const loaderVersion = options.loader
      ? (loader !== 'vanilla' ? options.loaderVersion || '' : '')
      : target
        ? (loader !== 'vanilla' ? target.loaderVersion || '' : '')
        : (!isOverride && loader !== 'vanilla' ? currentLoaderVersion() : '');
    const loaderLabel = loader !== 'vanilla'
      ? ` con ${App.loaderLabel(loader)}${loaderVersion ? ` ${loaderVersion}` : ''}`
      : '';

    clearDockTimer();
    state.launch.active = true;
    state.launch.phase = 'checking';
    state.launch.version = version;
    state.launch.server = serverAddress || null;
    state.launch.loader = loader;
    state.launch.loaderVersion = loaderVersion || null;
    state.launch.request = {
      server: serverAddress || '',
      versionOverride: versionOverride || '',
      version: options.version || '',
      loader,
      loaderVersion
    };
    const activeInstance = state.instances.find((instance) => instance.id === state.activeInstanceId) || state.instances[0];
    if (activeInstance) {
      activeInstance.lastPlayedAt = new Date().toISOString();
      App.instances?.render?.();
    }
    setPhase('checking', `Preparando Minecraft ${version}${loaderLabel}`, serverAddress ? `Conectando a ${serverAddress}…` : 'Comprobando Java y archivos del juego…', 3);
    updateSessionChip('checking');
    setPlaySub(`Preparando ${version}…`);

    try {
      const result = await api.launch.start({
        version,
        server: serverAddress || undefined,
        loader,
        loaderVersion: loaderVersion || undefined
      });
      if (!result?.ok) throw new Error(result?.message || 'No se pudo iniciar Minecraft.');
    } catch (error) {
      state.launch.active = false;
      setPhase('error', STATUS_TITLES.error, App.errorMessage(error), 100);
      updateSessionChip('error');
      setPlaySub('Error al iniciar');
      toast(App.errorMessage(error), 'error', 'Error de lanzamiento');
      updateConsoleStatus('Error');
    }
  }

  async function playInstance(instance) {
    if (!instance) return;
    try {
      if (state.activeInstanceId !== instance.id) {
        const data = await api.instances.select(instance.id);
        App.applyInstanceState(data);
      }
      App.go('home');
      await startGame('', '', {
        instance,
        version: instance.version || '',
        loader: instance.loader || 'vanilla',
        loaderVersion: instance.loaderVersion || ''
      });
    } catch (error) {
      toastError(App.errorMessage(error), 'No se pudo iniciar la instancia');
    }
  }

  async function stopGame() {
    const button = $('#btn-launch-stop');
    try {
      App.setBusy(button, true, 'Deteniendo…');
      const result = await api.launch.cancel();
      if (!result?.ok) {
        toast(result?.message || 'No hay ningún juego que detener.', 'warning');
        App.setBusy(button, false);
      }
    } catch (error) {
      toastError(App.errorMessage(error));
      App.setBusy(button, false);
    }
  }

  /* ---------------------------------------------------------------------- */
  /*                                Conexiones                              */
  /* ---------------------------------------------------------------------- */

  function init() {
    state.loader = state.settings?.lastLoader || state.loader || 'vanilla';
    state.loaderVersion = state.settings?.lastLoaderVersion || state.loaderVersion || '';

    $('#version-select')?.addEventListener('change', async (event) => {
      const version = event.target.value;
      renderSelectedVersion();
      renderStats();
      App.renderJavaChip?.();
      if (state.loader !== 'vanilla') loadLoaderVersions(false);
      const active = activeInstanceEntry();
      if (active) active.version = version;
      App.instances?.render?.();
      if (!state.settings || !version) return;
      state.settings.lastVersion = version;
      try {
        await api.settings.save({ lastVersion: version });
      } catch {
        /* se reintentará al cambiar de nuevo */
      }
    });

    $('#loader-select')?.addEventListener('change', async (event) => {
      state.loader = event.target.value;
      state.loaderVersion = '';
      state.loaderError = null;
      state.loaderLoading = false;
      if (state.settings) state.settings.lastLoader = state.loader;
      const active = activeInstanceEntry();
      if (active) {
        active.loader = state.loader;
        active.loaderVersion = '';
      }
      App.instances?.render?.();
      const versionSelect = $('#loader-version-select');
      if (versionSelect) {
        versionSelect.innerHTML = '';
        versionSelect.disabled = true;
      }
      renderSelectedVersion();
      if (state.loader === 'vanilla') {
        renderLoaderHint();
      } else {
        loadLoaderVersions(false);
      }
      try {
        await api.settings.save({ lastLoader: state.loader, lastLoaderVersion: '' });
      } catch {
        /* se reintentará al cambiar de nuevo */
      }
    });

    $('#loader-version-select')?.addEventListener('change', (event) => {
      applyLoaderVersion(event.target.value);
      renderSelectedVersion();
    });

    $('#btn-play')?.addEventListener('click', () => {
      if (state.launch.active) {
        showDock();
        toast('Minecraft ya está en marcha. Revisa la consola si necesitas detalles.', 'warning');
        return;
      }
      startGame();
    });

    $('#btn-play-server')?.addEventListener('click', () => App.go('servers'));

    $('#btn-quick-connect')?.addEventListener('click', () => {
      const id = $('#quick-server-select')?.value;
      const server = state.servers.find((item) => item.id === id);
      if (!server) {
        toast('Elige un servidor de la lista.', 'warning');
        return;
      }
      startGame(server.address);
    });

    $('#btn-open-game-folder')?.addEventListener('click', async () => {
      try {
        await api.openFolder('gameRoot');
      } catch (error) {
        toastError(App.errorMessage(error), 'No se pudo abrir la carpeta');
      }
    });

    $('#btn-launch-console')?.addEventListener('click', openConsole);
    $('#btn-launch-hide')?.addEventListener('click', hideDock);
    $('#btn-launch-stop')?.addEventListener('click', stopGame);
    $('#btn-console-close')?.addEventListener('click', closeConsole);
    $('#btn-console-copy')?.addEventListener('click', copyConsole);
    $('#btn-console-clear')?.addEventListener('click', () => {
      clearConsole();
      toast('Consola limpiada.', 'info');
    });

    $('#console-drawer')?.addEventListener('click', (event) => {
      if (event.target.id === 'console-drawer') closeConsole();
    });

    window.addEventListener('beforeunload', () => {
      if (state.launch.active) return;
    });
  }

  const home = {
    init,
    render,
    loadRemote,
    renderJava,
    renderStats,
    renderSelectedVersion,
    renderInstalled,
    renderQuickServers,
    startGame,
    playInstance
  };

  App.home = home;
  App.launch = {
    init,
    handle,
    restore,
    showDock,
    hideDock,
    openConsole,
    closeConsole,
    startGame
  };
})();
