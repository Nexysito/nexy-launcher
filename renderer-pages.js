'use strict';

/* NexyLauncher 1.0 — gestor de mods, actualizador y buscador. */
(() => {
  const App = window.NexyApp;
  const api = App.api;
  const { $, $$, esc, icon, state, toast, toastError } = App;

  let modUpdates = null;
  let updatesLoading = false;
  let updatesError = '';
  let updating = false;
  const updateSelection = new Set();

  /* ---------------------------------------------------------------------- */
  /*                                   Mods                                 */
  /* ---------------------------------------------------------------------- */

  async function refreshMods() {
    try {
      state.mods = await api.mods.list();
      renderMods();
      App.home?.render?.();
    } catch (error) {
      toastError(App.errorMessage(error), 'No se pudieron leer los mods');
    }
  }

  function showAddResult(result) {
    if (!result || result.canceled) return;
    if (Array.isArray(result.mods)) state.mods = result.mods;
    renderMods();
    App.home?.render?.();
    const added = result.added?.length || 0;
    const skipped = result.skipped?.length || 0;
    if (added && skipped) toast(`${added} mod${added === 1 ? '' : 's'} añadido${added === 1 ? '' : 's'}. ${skipped} archivo${skipped === 1 ? '' : 's'} no válido${skipped === 1 ? '' : 's'}.`, 'warning', 'Añadido con avisos');
    else if (added) toast(`${added} mod${added === 1 ? '' : 's'} añadido${added === 1 ? '' : 's'} a la carpeta mods.`, 'success', 'Mods añadidos');
    else if (skipped) toast('Los archivos no son .jar válidos o superan el tamaño máximo.', 'error', 'Nada añadido');
  }

  async function pickMods() {
    try {
      const result = await api.mods.pick();
      showAddResult(result);
    } catch (error) {
      toastError(App.errorMessage(error), 'No se pudieron añadir mods');
    }
  }

  async function dropMods(files) {
    const list = [...files].filter((file) => /\.jar$/i.test(file.name)).slice(0, 30);
    if (!list.length) {
      toast('Arrastra archivos con extensión .jar.', 'warning', 'Archivo no válido');
      return;
    }

    try {
      const paths = [];
      const buffers = [];
      for (const file of list) {
        const path = api.getPathForFile?.(file);
        if (path) paths.push(path);
        else buffers.push(file);
      }

      if (paths.length) showAddResult(await api.mods.add(paths));
      for (const file of buffers.slice(0, 30 - paths.length)) {
        const buffer = await file.arrayBuffer();
        showAddResult(await api.mods.addBuffer(file.name, buffer));
      }
    } catch (error) {
      toastError(App.errorMessage(error), 'No se pudieron añadir los mods');
    }
  }

  function renderMods() {
    renderModsTabs();
    renderUpdates();
    if (state.modsTab === 'browse') renderModBrowser();
    const host = $('#mods-list');
    if (!host) return;
    const query = state.modsQuery.trim().toLowerCase();
    const filtered = state.mods.filter((mod) => mod.file.toLowerCase().includes(query));
    const enabled = state.mods.filter((mod) => mod.enabled).length;
    const size = state.mods.reduce((total, mod) => total + (mod.size || 0), 0);

    const summary = $('#mods-summary');
    if (summary) summary.textContent = state.mods.length
      ? `${state.mods.length} archivo${state.mods.length === 1 ? '' : 's'} · ${enabled} activo${enabled === 1 ? '' : 's'} · ${App.formatBytes(size)}`
      : 'Sin mods instalados';

    const structuralEmpty = $('#mods-empty');
    if (!state.mods.length) {
      host.innerHTML = '';
      host.hidden = true;
      if (structuralEmpty) structuralEmpty.hidden = false;
      return;
    }
    if (structuralEmpty) structuralEmpty.hidden = true;

    if (!filtered.length) {
      host.hidden = false;
      host.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1">
          <span class="empty-icon">${icon('box')}</span>
          <h3>No hay coincidencias</h3>
          <p>Ningún mod coincide con “${esc(state.modsQuery)}”.</p>
        </div>`;
      return;
    }

    host.hidden = false;
    host.innerHTML = filtered.map((mod) => {
      const display = mod.file.replace(/\.disabled$/i, '');
      return `
        <div class="mod-card ${mod.enabled ? '' : 'disabled'}">
          <span class="mod-icon">${icon('box')}</span>
          <div class="mod-main">
            <strong title="${esc(display)}">${esc(display)}</strong>
            <small>${esc(App.formatBytes(mod.size))} · ${mod.enabled ? 'Activo' : 'Desactivado'} · ${esc(App.formatDate(mod.modified))}</small>
          </div>
          <div class="mod-actions">
            <label class="switch" title="${mod.enabled ? 'Desactivar mod' : 'Activar mod'}">
              <input type="checkbox" data-toggle-mod="${esc(mod.file)}" ${mod.enabled ? 'checked' : ''}>
              <span class="switch-track"></span>
            </label>
            <button class="action-btn danger" data-delete-mod="${esc(mod.file)}" title="Eliminar mod">${icon('trash')}</button>
          </div>
        </div>`;
    }).join('');
  }

  function renderModsTabs() {
    $$('#mods-tabs [data-mtab]').forEach((button) => {
      button.classList.toggle('active', button.dataset.mtab === state.modsTab);
    });
    const installedView = $('#mods-installed-view');
    const browseView = $('#mods-browse-view');
    if (installedView) installedView.hidden = state.modsTab !== 'installed';
    if (browseView) browseView.hidden = state.modsTab !== 'browse';
    const count = $('#count-mods');
    if (count) count.textContent = String(state.mods.length);
  }

  function setModsTab(tab) {
    state.modsTab = tab === 'browse' ? 'browse' : 'installed';
    renderModsTabs();
    if (state.modsTab === 'browse') ensureBrowser();
  }

  function hasCurseForgeKey() {
    return Boolean(String(state.settings?.curseforgeApiKey || '').trim());
  }

  function modGameVersions() {
    const ids = new Set();
    state.localVersions
      .filter((version) => App.isBaseVersion(version))
      .forEach((version) => ids.add(version.id));
    (state.remote?.versions || [])
      .filter((version) => version.type === 'release')
      .slice(0, 50)
      .forEach((version) => ids.add(version.id));
    const current = state.modGameVersion || App.selectedVersion() || state.settings?.lastVersion;
    if (current) ids.add(current);
    return [...ids].filter(Boolean);
  }

  function populateModVersions() {
    const select = $('#mod-game-version');
    if (!select) return;
    const values = modGameVersions();
    const fallback = select.value || App.selectedVersion() || state.settings?.lastVersion || '';
    const previous = state.modGameVersion === null ? fallback : state.modGameVersion;
    select.innerHTML = `<option value="">Todas las versiones</option>${values.map((id) => `<option value="${esc(id)}">${esc(id)}</option>`).join('')}`;
    const chosen = previous === '' ? '' : values.includes(previous) ? previous : values[0] || '';
    select.value = chosen;
    state.modGameVersion = chosen;
  }

  function providerLabel(provider) {
    return provider === 'curseforge' ? 'CurseForge' : 'Modrinth';
  }

  function renderModBrowser() {
    const host = $('#mod-browse-list');
    if (!host) return;
    populateModVersions();
    const provider = state.modProvider || 'modrinth';
    const providerSelect = $('#mod-provider');
    if (providerSelect && providerSelect.value !== provider) providerSelect.value = provider;
    const loaderSelect = $('#mod-loader-filter');
    if (loaderSelect && loaderSelect.value !== state.modLoaderFilter) loaderSelect.value = state.modLoaderFilter;
    const search = $('#mod-browse-search');
    if (search && document.activeElement !== search && search.value !== state.modQuery) search.value = state.modQuery;

    const searchButton = $('#btn-mod-search');
    if (searchButton) {
      searchButton.disabled = state.modLoading;
      searchButton.classList.toggle('loading', state.modLoading);
    }

    const note = $('#mod-browse-note');
    const context = [
      providerLabel(provider),
      state.modGameVersion || 'todas las versiones',
      state.modLoaderFilter ? App.loaderLabel(state.modLoaderFilter) : 'todos los cargadores'
    ].join(' · ');
    if (note) {
      if (provider === 'curseforge' && !hasCurseForgeKey()) {
        note.textContent = 'CurseForge necesita una API key. Añádela en Ajustes → Mods e integraciones o cambia a Modrinth.';
        note.classList.add('warn');
      } else if (state.modLoading) {
        note.textContent = `Buscando mods en ${providerLabel(provider)}…`;
        note.classList.remove('warn');
      } else if (state.modError) {
        note.textContent = state.modError;
        note.classList.add('warn');
      } else {
        note.textContent = `Resultados para ${context}. En Modrinth, las dependencias obligatorias se instalan automáticamente.`;
        note.classList.remove('warn');
      }
    }

    const empty = $('#mod-browse-empty');
    const emptyTitle = $('#mod-browse-empty-title');
    const emptyText = $('#mod-browse-empty-text');
    if (!state.modResults.length) {
      host.innerHTML = '';
      host.hidden = true;
      if (empty) empty.hidden = false;
      if (emptyTitle) {
        emptyTitle.textContent = provider === 'curseforge' && !hasCurseForgeKey()
          ? 'CurseForge está desactivado'
          : state.modQuery ? 'No hay coincidencias' : 'Busca tu próximo mod';
      }
      if (emptyText) {
        emptyText.textContent = provider === 'curseforge' && !hasCurseForgeKey()
          ? 'Añade tu API key en Ajustes → Mods e integraciones para buscar en CurseForge. Modrinth funciona sin configuración.'
          : state.modQuery
            ? `Ningún mod coincide con “${state.modQuery}” para los filtros elegidos. Prueba con otra versión o cargador.`
            : 'Escribe un nombre o pulsa Buscar para explorar los mods más descargados.';
      }
    } else {
      if (empty) empty.hidden = true;
      host.hidden = false;
      host.innerHTML = state.modResults.map((hit, index) => {
        const downloads = Number(hit.downloads) || 0;
        const categories = (hit.categories || []).slice(0, 3).map((category) => `<span class="mod-tag">${esc(category)}</span>`).join('');
        return `
          <article class="mod-browse-card">
            <span class="mod-browse-icon">
              ${icon('box')}
              ${hit.icon ? `<img src="${esc(hit.icon)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}
            </span>
            <div class="mod-browse-main">
              <div class="mod-browse-title">
                <strong title="${esc(hit.title)}">${esc(hit.title)}</strong>
                <span class="provider-chip provider-${esc(hit.provider || provider)}">${esc(providerLabel(hit.provider || provider))}</span>
              </div>
              <p>${esc(hit.description || 'Sin descripción disponible.')}</p>
              <div class="mod-browse-meta">
                <span>${icon('download')}${esc(App.formatNumber(downloads))}</span>
                ${hit.author ? `<span>${icon('user')}${esc(hit.author)}</span>` : ''}
                ${categories}
              </div>
            </div>
            <button class="btn btn-secondary btn-sm" data-mod-details="${index}">Ver versiones</button>
          </article>`;
      }).join('');

      $$('img', host).forEach((image) => {
        image.addEventListener('error', () => {
          image.hidden = true;
        });
      });
    }

    const pager = $('#mods-pager');
    if (pager) {
      pager.hidden = !state.modResults.length && state.modOffset === 0;
      const page = Math.floor(state.modOffset / 20) + 1;
      const totalPages = Math.max(1, Math.ceil((state.modTotal || 0) / 20));
      const label = $('#mods-page');
      if (label) label.textContent = `Página ${page}${state.modTotal ? ` de ${totalPages}` : ''} · ${state.modTotal.toLocaleString('es-ES')} mods`;
      const prev = $('#mods-prev');
      const next = $('#mods-next');
      if (prev) prev.disabled = state.modLoading || state.modOffset <= 0;
      if (next) next.disabled = state.modLoading || state.modOffset + 20 >= (state.modTotal || 0);
    }
  }

  async function runModSearch(reset = true) {
    if (reset) state.modOffset = 0;
    const provider = state.modProvider || 'modrinth';
    if (provider === 'curseforge' && !hasCurseForgeKey()) {
      state.modError = null;
      state.modResults = [];
      state.modTotal = 0;
      renderModBrowser();
      return;
    }

    const request = ++state.modRequest;
    state.modLoading = true;
    state.modError = null;
    state.modProgress = null;
    renderModBrowser();

    const payload = {
      query: state.modQuery,
      gameVersion: state.modGameVersion || undefined,
      loader: state.modLoaderFilter || undefined,
      limit: 20,
      offset: state.modOffset
    };

    try {
      const data = provider === 'curseforge'
        ? await api.curseforge.search(payload)
        : await api.modrinth.search(payload);
      if (request !== state.modRequest) return;
      state.modResults = Array.isArray(data.hits) ? data.hits : [];
      state.modTotal = Number(data.total) || state.modResults.length;
      state.modError = null;
    } catch (error) {
      if (request !== state.modRequest) return;
      state.modResults = [];
      state.modTotal = 0;
      state.modError = App.errorMessage(error);
      toastError(state.modError, 'No se pudo buscar mods');
    } finally {
      if (request === state.modRequest) {
        state.modLoading = false;
        renderModBrowser();
      }
    }
  }

  function modVersionName(version) {
    return version?.name || version?.displayName || version?.versionNumber || version?.fileName || 'Versión sin nombre';
  }

  function modVersionMeta(version) {
    const parts = [];
    const number = version?.versionNumber || version?.fileName;
    if (number) parts.push(number);
    const games = version?.gameVersions || [];
    if (games.length) parts.push(games.slice(0, 4).join(', '));
    const loaders = version?.loaders || [];
    if (loaders.length) parts.push(loaders.slice(0, 3).join(', '));
    if (version?.size) parts.push(App.formatBytes(version.size));
    if (version?.datePublished) parts.push(App.formatDate(version.datePublished));
    return parts.join(' · ');
  }

  function renderModDetails(detail) {
    const hit = detail.hit;
    const provider = detail.provider;
    const versions = detail.versions || [];
    const rows = detail.loading
      ? `<div class="mod-detail-loading"><span class="spinner"></span>Buscando versiones compatibles…</div>`
      : detail.error
        ? `<div class="form-error">${esc(detail.error)}</div>`
        : versions.length
          ? versions.slice(0, 40).map((version) => {
            const available = version.available !== false;
            return `
              <div class="mod-version-row">
                <div class="mod-version-main">
                  <strong>${esc(modVersionName(version))}</strong>
                  <small>${esc(modVersionMeta(version) || 'Sin detalles')}</small>
                </div>
                <button class="btn btn-primary btn-sm" data-mod-install="${esc(version.id)}" ${available ? '' : 'disabled'} title="${available ? 'Instalar esta versión' : 'El autor no permite descargas externas'}">
                  ${icon('download')}${available ? 'Instalar' : 'No disponible'}
                </button>
              </div>`;
          }).join('')
          : `<div class="empty-state compact"><span class="empty-icon">${icon('box')}</span><h3>Sin versiones compatibles</h3><p>Prueba con otra versión de Minecraft o cambia el cargador.</p></div>`;

    const categories = (hit.categories || []).map((category) => `<span class="mod-tag">${esc(category)}</span>`).join('');
    return `
      <div class="modal-head">
        <div class="mod-detail-head">
          <span class="mod-browse-icon large">
            ${icon('box')}
            ${hit.icon ? `<img src="${esc(hit.icon)}" alt="" referrerpolicy="no-referrer">` : ''}
          </span>
          <div>
            <span class="eyebrow">${esc(providerLabel(provider))}</span>
            <h2>${esc(hit.title)}</h2>
            <p>${esc(hit.description || 'Sin descripción disponible.')}</p>
          </div>
        </div>
        <button class="icon-btn modal-close" data-modal-close aria-label="Cerrar">${icon('x')}</button>
      </div>
      <div class="mod-detail-meta">
        <span>${icon('download')}${App.formatNumber(hit.downloads)} descargas</span>
        ${hit.author ? `<span>${icon('user')}${esc(hit.author)}</span>` : ''}
        <span>${icon('layers')}${esc(state.modGameVersion || 'Todas las versiones')}</span>
        <span>${icon('box')}${esc(state.modLoaderFilter ? App.loaderLabel(state.modLoaderFilter) : 'Todos los cargadores')}</span>
        ${categories}
      </div>
      <div class="mod-detail-versions">
        <div class="mod-detail-versions-head">
          <strong>Versiones compatibles</strong>
          <span id="mod-install-progress" class="mod-install-progress"></span>
        </div>
        ${rows}
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" data-modal-close>Cerrar</button>
      </div>`;
  }

  async function openModDetails(index) {
    const hit = state.modResults[index];
    if (!hit) return;
    const provider = hit.provider || state.modProvider || 'modrinth';
    const detail = {
      hit,
      provider,
      versions: [],
      loading: true,
      error: null,
      gameVersion: state.modGameVersion,
      loader: state.modLoaderFilter
    };
    state.modDetail = detail;
    App.openModal(renderModDetails(detail), { wide: true });
    $$('#modal img').forEach((image) => image.addEventListener('error', () => { image.hidden = true; }));

    try {
      const payload = provider === 'curseforge'
        ? { modId: hit.id, gameVersion: detail.gameVersion || undefined, loader: detail.loader || undefined }
        : { projectId: hit.id, gameVersion: detail.gameVersion || undefined, loader: detail.loader || undefined };
      const data = provider === 'curseforge'
        ? await api.curseforge.versions(payload)
        : await api.modrinth.versions(payload);
      if (state.modDetail !== detail) return;
      detail.versions = Array.isArray(data.versions) ? data.versions : [];
      detail.loading = false;
    } catch (error) {
      if (state.modDetail !== detail) return;
      detail.loading = false;
      detail.error = App.errorMessage(error);
    }
    if (state.modDetail === detail) {
      App.openModal(renderModDetails(detail), { wide: true });
      $$('#modal img').forEach((image) => image.addEventListener('error', () => { image.hidden = true; }));
    }
  }

  async function installModVersion(versionId, button) {
    const detail = state.modDetail;
    if (!detail) return;
    if (button) App.setBusy(button, true, 'Instalando…');
    try {
      const payload = detail.provider === 'curseforge'
        ? { modId: detail.hit.id, fileId: versionId, gameVersion: detail.gameVersion || undefined, loader: detail.loader || undefined }
        : { projectId: detail.hit.id, versionId, gameVersion: detail.gameVersion || undefined, loader: detail.loader || undefined };
      const result = detail.provider === 'curseforge'
        ? await api.curseforge.install(payload)
        : await api.modrinth.install(payload);

      if (Array.isArray(result.mods)) state.mods = result.mods;
      else state.mods = await api.mods.list();
      renderMods();
      App.home?.render?.();
      const added = Array.isArray(result.added) ? result.added.length : 1;
      const dependencies = Math.max(0, (result.installed?.length || 1) - 1);
      const suffix = dependencies ? ` y ${dependencies} dependencia${dependencies === 1 ? '' : 's'}` : '';
      toast(`${added} archivo${added === 1 ? '' : 's'} instalado${added === 1 ? '' : 's'}${suffix}.`, 'success', 'Mod instalado');
      App.closeModal();
    } catch (error) {
      toastError(App.errorMessage(error), 'No se pudo instalar el mod');
      if (button) App.setBusy(button, false);
    }
  }

  function onModProgress(payload) {
    if (!payload) return;
    state.modProgress = payload;
    const percent = Number.isFinite(payload.percent) ? payload.percent : null;
    const note = $('#mod-browse-note');
    if (note && state.modsTab === 'browse') {
      note.textContent = percent === null ? 'Descargando mod…' : `Descargando mod… ${percent}%`;
      note.classList.remove('warn');
    }
    const progress = $('#mod-install-progress');
    if (progress) progress.textContent = percent === null ? 'Descargando…' : `Descargando… ${percent}%`;
  }

  function ensureBrowser() {
    populateModVersions();
    renderModsTabs();
    renderModBrowser();
    if (!state.modResults.length && !state.modLoading && !state.modError) {
      if (state.modProvider !== 'curseforge' || hasCurseForgeKey()) runModSearch(true);
    }
  }

  async function toggleMod(file, checkbox) {
    if (checkbox) checkbox.disabled = true;
    try {
      state.mods = await api.mods.toggle(file);
      renderMods();
      App.home?.render?.();
      const mod = state.mods.find((item) => item.file === file || item.file === `${file}.disabled`);
      toast(mod?.enabled ? 'Mod activado.' : 'Mod desactivado.', 'success');
    } catch (error) {
      toastError(App.errorMessage(error), 'No se pudo cambiar el mod');
      renderMods();
    }
  }

  async function deleteMod(file) {
    const display = file.replace(/\.disabled$/i, '');
    const accepted = await App.confirmDialog({
      title: '¿Eliminar este mod?',
      message: `Se borrará “${display}” de la carpeta mods. No se puede deshacer.`,
      confirm: 'Eliminar mod',
      icon: 'trash'
    });
    if (!accepted) return;
    try {
      state.mods = await api.mods.remove(file);
      renderMods();
      App.home?.render?.();
      toast(`“${display}” eliminado.`, 'success', 'Mod eliminado');
    } catch (error) {
      toastError(App.errorMessage(error), 'No se pudo eliminar el mod');
    }
  }

  function updateSummaryText() {
    if (updatesLoading) return 'Buscando versiones nuevas en Modrinth…';
    if (updatesError) return updatesError;
    if (!modUpdates) return 'Comprueba si hay versiones nuevas compatibles con esta instancia.';
    if (modUpdates.needsVersion) {
      return 'Asigna una versión de Minecraft a la instancia para comprobar actualizaciones compatibles.';
    }
    const updates = modUpdates.updates?.length || 0;
    const tracked = modUpdates.tracked || 0;
    const errors = modUpdates.errors?.length || 0;
    if (!tracked) {
      return 'Ningún mod instalado tiene información de Modrinth. Instálalos desde Descubrir para poder actualizarlos.';
    }
    const base = updates
      ? `${updates} actualización${updates === 1 ? '' : 'es'} disponible${updates === 1 ? '' : 's'} de ${tracked} mods comprobados.`
      : `Todo al día. ${tracked} mod${tracked === 1 ? '' : 's'} comprobado${tracked === 1 ? '' : 's'}.`;
    return errors ? `${base} ${errors} no se pudieron comprobar.` : base;
  }

  function updateRow(item) {
    const selected = updateSelection.has(item.file);
    const type = ['release', 'beta', 'alpha'].includes(item.versionType) ? item.versionType : 'release';
    return `
      <article class="update-row${selected ? ' selected' : ''}">
        <input type="checkbox" data-update-pick="${esc(item.file)}" ${selected ? 'checked' : ''} ${updating ? 'disabled' : ''} aria-label="Seleccionar ${esc(item.name)}">
        <div class="update-main">
          <div class="update-title">
            <strong title="${esc(item.name)}">${esc(item.name)}</strong>
            <span class="update-badge ${type}">${type === 'release' ? 'Estable' : type === 'beta' ? 'Beta' : 'Alpha'}</span>
          </div>
          <small><span class="update-old">${esc(item.currentVersion || 'versión desconocida')}</span><span class="update-arrow">→</span><span class="update-new">${esc(item.versionNumber || 'nueva versión')}</span></small>
          <small class="update-file" title="${esc(item.filename)}">${esc(item.filename || item.file)}${item.size ? ` · ${esc(App.formatBytes(item.size))}` : ''}</small>
          ${item.changelog ? `<details class="update-changelog"><summary>Ver cambios</summary><p>${esc(item.changelog)}</p></details>` : ''}
        </div>
        <button type="button" class="btn btn-ghost btn-sm" data-update-one="${esc(item.file)}" ${updating ? 'disabled' : ''}>${icon('download')}Actualizar</button>
      </article>`;
  }

  function renderUpdates() {
    if (!$('#mods-updates-panel')) return;
    const summary = $('#mods-updates-summary');
    if (summary) summary.textContent = updateSummaryText();
    const list = $('#mods-updates-list');
    const updates = modUpdates?.updates || [];
    if (list) {
      list.hidden = !updates.length;
      list.innerHTML = updates.length ? updates.map(updateRow).join('') : '';
    }
    const check = $('#btn-check-updates');
    if (check) {
      check.disabled = updatesLoading || updating;
      check.classList.toggle('loading', updatesLoading);
      const label = check.lastChild;
      if (label && label.nodeType === Node.TEXT_NODE) label.textContent = updatesLoading ? 'Buscando…' : 'Buscar actualizaciones';
    }
    const all = $('#btn-update-all');
    if (all) {
      all.hidden = !updates.length;
      all.disabled = updating || !updateSelection.size;
      const label = all.lastChild;
      if (label && label.nodeType === Node.TEXT_NODE) {
        label.textContent = updating ? 'Actualizando…' : `Actualizar seleccionados${updateSelection.size ? ` (${updateSelection.size})` : ''}`;
      }
    }
  }

  async function checkModUpdates() {
    if (updatesLoading || updating) return;
    updatesLoading = true;
    updatesError = '';
    renderUpdates();
    try {
      modUpdates = await api.mods.checkUpdates();
      updateSelection.clear();
      (modUpdates.updates || []).forEach((item) => updateSelection.add(item.file));
    } catch (error) {
      updatesError = App.errorMessage(error);
      modUpdates = null;
      updateSelection.clear();
      toastError(updatesError, 'No se pudieron comprobar las actualizaciones');
    } finally {
      updatesLoading = false;
      renderUpdates();
    }
  }

  async function runModUpdates(files) {
    const selected = [...new Set(files)].filter(Boolean);
    const items = (modUpdates?.updates || []).filter((item) => selected.includes(item.file));
    if (!items.length) {
      toast('Selecciona al menos una actualización.', 'warning');
      return;
    }
    updating = true;
    renderUpdates();
    let completed = false;
    try {
      const result = await api.mods.update({
        mods: items.map((item) => ({ file: item.file, versionId: item.versionId }))
      });
      if (Array.isArray(result.mods)) state.mods = result.mods;
      const count = result.updated?.length || 0;
      if (count) {
        toast(`${count} mod${count === 1 ? '' : 's'} actualizado${count === 1 ? '' : 's'}.`, 'success', 'Mods actualizados');
      }
      if (result.failed?.length) {
        toastError(`${result.failed.length} mod${result.failed.length === 1 ? '' : 's'} no se pudo actualizar: ${result.failed[0].error}`, 'Actualización incompleta');
      }
      App.home?.render?.();
      App.instances?.render?.();
      completed = true;
    } catch (error) {
      toastError(App.errorMessage(error), 'No se pudieron actualizar los mods');
    } finally {
      updating = false;
      renderUpdates();
    }
    if (completed) await checkModUpdates();
    renderMods();
  }

  function bindMods() {
    $('#btn-add-mods')?.addEventListener('click', pickMods);
    $('#btn-add-mods-2')?.addEventListener('click', pickMods);
    $('#btn-check-updates')?.addEventListener('click', checkModUpdates);
    $('#btn-update-all')?.addEventListener('click', () => runModUpdates([...updateSelection]));

    $('#mods-updates-list')?.addEventListener('change', (event) => {
      const pick = event.target.closest('[data-update-pick]');
      if (!pick) return;
      if (pick.checked) updateSelection.add(pick.dataset.updatePick);
      else updateSelection.delete(pick.dataset.updatePick);
      pick.closest('.update-row')?.classList.toggle('selected', pick.checked);
      renderUpdates();
    });

    $('#mods-updates-list')?.addEventListener('click', (event) => {
      const one = event.target.closest('[data-update-one]');
      if (one) runModUpdates([one.dataset.updateOne]);
    });

    $('#btn-open-mods')?.addEventListener('click', () => {
      api.openFolder('mods').catch((error) => toastError(App.errorMessage(error)));
    });

    $$('#mods-tabs [data-mtab]').forEach((button) => {
      button.addEventListener('click', () => setModsTab(button.dataset.mtab));
    });

    $('#mods-empty')?.addEventListener('click', (event) => {
      if (event.target.closest('[data-mtab-jump]')) setModsTab(event.target.closest('[data-mtab-jump]').dataset.mtabJump);
    });

    $('#mod-provider')?.addEventListener('change', async (event) => {
      state.modProvider = event.target.value === 'curseforge' ? 'curseforge' : 'modrinth';
      state.modResults = [];
      state.modOffset = 0;
      state.modError = null;
      if (state.settings) state.settings.modProvider = state.modProvider;
      api.settings.save({ modProvider: state.modProvider }).catch(() => {});
      renderModBrowser();
      if (state.modProvider !== 'curseforge' || hasCurseForgeKey()) runModSearch(true);
    });

    $('#mod-game-version')?.addEventListener('change', (event) => {
      state.modGameVersion = event.target.value;
      state.modOffset = 0;
      runModSearch(true);
    });

    $('#mod-loader-filter')?.addEventListener('change', (event) => {
      state.modLoaderFilter = event.target.value;
      state.modOffset = 0;
      runModSearch(true);
    });

    $('#mod-browse-search')?.addEventListener('input', App.debounce((event) => {
      state.modQuery = event.target.value;
      state.modOffset = 0;
      runModSearch(true);
    }, 420));

    $('#mod-browse-search')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        state.modQuery = event.target.value;
        runModSearch(true);
      }
    });

    $('#btn-mod-search')?.addEventListener('click', () => {
      state.modQuery = $('#mod-browse-search')?.value || '';
      runModSearch(true);
    });

    $('#mods-prev')?.addEventListener('click', () => {
      if (state.modOffset <= 0) return;
      state.modOffset = Math.max(0, state.modOffset - 20);
      runModSearch(false);
    });

    $('#mods-next')?.addEventListener('click', () => {
      if (state.modOffset + 20 >= state.modTotal) return;
      state.modOffset += 20;
      runModSearch(false);
    });

    $('#mod-browse-list')?.addEventListener('click', (event) => {
      const details = event.target.closest('[data-mod-details]');
      if (details) openModDetails(Number(details.dataset.modDetails));
    });

    $('#modal')?.addEventListener('click', (event) => {
      const install = event.target.closest('[data-mod-install]');
      if (install) installModVersion(install.dataset.modInstall, install);
    });

    $('#mods-search')?.addEventListener('input', App.debounce((event) => {
      state.modsQuery = event.target.value;
      renderMods();
    }, 100));

    const dropzone = $('#mods-dropzone');
    if (dropzone) {
      ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((type) => {
        document.addEventListener(type, (event) => {
          if (['dragover', 'dragenter', 'drop'].includes(type) && [...event.dataTransfer.types].includes('Files')) {
            event.preventDefault();
          }
        });
      });

      dropzone.addEventListener('dragenter', (event) => {
        event.preventDefault();
        dropzone.classList.add('dragover');
      });
      dropzone.addEventListener('dragover', (event) => {
        event.preventDefault();
        dropzone.dataset.dragging = '1';
      });
      dropzone.addEventListener('dragleave', (event) => {
        if (!dropzone.contains(event.relatedTarget)) dropzone.classList.remove('dragover');
      });
      dropzone.addEventListener('drop', (event) => {
        event.preventDefault();
        dropzone.classList.remove('dragover');
        if (event.dataTransfer?.files?.length) dropMods(event.dataTransfer.files);
      });
    }

    $('#mods-list')?.addEventListener('change', (event) => {
      const checkbox = event.target.closest('[data-toggle-mod]');
      if (checkbox) toggleMod(checkbox.dataset.toggleMod, checkbox);
    });

    $('#mods-list')?.addEventListener('click', (event) => {
      const remove = event.target.closest('[data-delete-mod]');
      if (remove) deleteMod(remove.dataset.deleteMod);
    });
  }

  App.mods = {
    init: bindMods,
    render: renderMods,
    refresh: refreshMods,
    pick: pickMods,
    setTab: setModsTab,
    ensureBrowser,
    onProgress: onModProgress,
    search: runModSearch
  };
})();
