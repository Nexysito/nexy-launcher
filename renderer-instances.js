'use strict';

/* NexyLauncher 1.0 — instancias de Minecraft aisladas. */
(() => {
  const App = window.NexyApp;
  const api = App.api;
  const { $, esc, icon, state, toast, toastError } = App;

  const LOADERS = ['vanilla', 'fabric', 'forge', 'neoforge', 'quilt'];

  function activeInstance() {
    return state.instances.find((instance) => instance.id === state.activeInstanceId) || state.instances[0] || null;
  }

  function assignmentLabel(instance) {
    if (!instance?.version) return 'Sin versión asignada';
    const loader = instance.loader || 'vanilla';
    const loaderText = loader === 'vanilla'
      ? 'Vanilla'
      : `${App.loaderLabel(loader)}${instance.loaderVersion ? ` ${instance.loaderVersion}` : ''}`;
    return `Minecraft ${instance.version} · ${loaderText}`;
  }

  let detailId = null;
  let detailMods = [];
  let detailLoading = false;
  let detailModsError = '';
  let detailView = 'detail';
  let modBrowseQuery = '';
  let modBrowseResults = [];
  let modBrowseLoading = false;
  let modBrowseError = '';
  let modBrowseTotal = 0;
  let modBrowseRequest = 0;
  let selectedModId = null;
  let selectedModHit = null;
  let selectedModProject = null;
  let selectedModError = '';
  let selectedModLoading = false;
  let selectedModVersions = [];
  let selectedModVersionsLoading = false;
  let selectedModVersionsError = '';
  let selectedModTab = 'description';
  let selectedModAllVersions = [];
  let selectedModAllVersionsLoading = false;
  let selectedModAllVersionsError = '';
  let selectedModAllVersionsLoaded = false;
  let modVersionOnlyCompatible = true;
  let modVersionChannel = 'all';

  function detailInstance() {
    return state.instances.find((instance) => instance.id === detailId) || null;
  }

  function coverMarkup(instance) {
    if (instance.cover) {
      return `<img src="${esc(instance.cover)}" alt="Carátula de ${esc(instance.name)}">`;
    }
    const letter = String(instance.name || 'N').trim().charAt(0).toUpperCase() || 'N';
    return `<span class="instance-cover-fallback">${esc(letter)}</span>`;
  }

  function instanceCard(instance) {
    const active = instance.id === state.activeInstanceId;
    const lastPlayed = instance.lastPlayedAt ? App.relativeDate(instance.lastPlayedAt) : 'Nunca';
    const description = String(instance.description || '').trim();
    return `
      <article class="instance-card${active ? ' active' : ''}" data-instance-id="${esc(instance.id)}" tabindex="0" role="button" aria-label="Abrir ${esc(instance.name)}">
        <div class="instance-card-cover">
          ${coverMarkup(instance)}
          ${active ? '<span class="badge badge-accent instance-cover-badge">Activa</span>' : ''}
          ${instance.exists ? '' : '<span class="badge badge-warn instance-cover-badge">Carpeta no encontrada</span>'}
        </div>
        <div class="instance-card-body">
          <div class="instance-card-title">
            <strong>${esc(instance.name)}</strong>
            <small>${esc(assignmentLabel(instance))}</small>
          </div>
          <p class="instance-description${description ? '' : ' empty'}">${description ? esc(description) : 'Sin descripción'}</p>
          <div class="instance-meta">
            <span>${icon('box')}<b>${instance.mods || 0}</b> mods</span>
            <span>${icon('grid')}<b>${instance.worlds || 0}</b> mundos</span>
            <span>${icon('clock')}${esc(lastPlayed)}</span>
          </div>
          <div class="instance-foot">
            <button class="btn btn-primary btn-sm" data-instance-play>${icon('play')}Jugar</button>
            <span class="instance-open-hint">Ver instancia ${icon('chevron-right')}</span>
          </div>
        </div>
      </article>`;
  }

  function groupDetailMods(mods) {
    const groups = [];
    const byProject = new Map();
    for (const mod of mods) {
      if (!mod.projectId) {
        groups.push({ projectId: null, mods: [mod] });
        continue;
      }
      const existing = byProject.get(mod.projectId);
      if (existing) {
        existing.mods.push(mod);
      } else {
        const group = { projectId: mod.projectId, mods: [mod] };
        byProject.set(mod.projectId, group);
        groups.push(group);
      }
    }
    return groups;
  }

  function detailModVersionLabel(mod) {
    return mod.versionNumber || mod.name || mod.file.replace(/\.disabled$/i, '');
  }

  function detailModsSummary() {
    if (detailLoading) return 'Leyendo mods…';
    if (detailModsError) return 'No se pudieron leer los mods.';
    if (!detailMods.length) return 'Sin mods instalados.';
    const groups = groupDetailMods(detailMods);
    const enabled = detailMods.filter((mod) => mod.enabled).length;
    const size = detailMods.reduce((total, mod) => total + (mod.size || 0), 0);
    const versions = groups.length !== detailMods.length
      ? ` · ${detailMods.length} versiones`
      : '';
    return `${groups.length} mod${groups.length === 1 ? '' : 's'}${versions} · ${enabled} activo${enabled === 1 ? '' : 's'} · ${App.formatBytes(size)}`;
  }

  function detailModRowMarkup(mod) {
    const display = mod.file.replace(/\.disabled$/i, '');
    return `
      <div class="detail-mod ${mod.enabled ? '' : 'off'}" data-mod-file="${esc(mod.file)}">
        <span class="mod-icon">${icon('box')}</span>
        <div class="mod-main">
          <strong title="${esc(display)}">${esc(display)}</strong>
          <small>${esc(App.formatBytes(mod.size))} · ${mod.enabled ? 'Activo' : 'Desactivado'}</small>
        </div>
        <label class="switch" title="${mod.enabled ? 'Desactivar mod' : 'Activar mod'}">
          <input type="checkbox" data-detail-mod-toggle="${esc(mod.file)}" ${mod.enabled ? 'checked' : ''}>
          <span class="switch-track"></span>
        </label>
        <button class="icon-btn danger" data-detail-mod-delete="${esc(mod.file)}" title="Eliminar mod" aria-label="Eliminar ${esc(display)}">${icon('trash')}</button>
      </div>`;
  }

  function detailModGroupMarkup(group) {
    if (group.mods.length === 1) return detailModRowMarkup(group.mods[0]);
    const selected = group.mods.find((mod) => mod.enabled) || group.mods[0];
    const display = selected.name || selected.file.replace(/\.disabled$/i, '');
    const options = group.mods.map((mod) => {
      const label = detailModVersionLabel(mod);
      return `<option value="${esc(mod.file)}" ${mod.file === selected.file ? 'selected' : ''}>${esc(label)}${mod.enabled ? ' · activa' : ''}</option>`;
    }).join('');
    return `
      <div class="detail-mod detail-mod-group${selected.enabled ? '' : ' off'}" data-mod-file="${esc(selected.file)}">
        <span class="mod-icon">${icon('box')}</span>
        <div class="mod-main">
          <strong title="${esc(selected.file)}">${esc(display)}</strong>
          <small>${group.mods.length} versiones instaladas · ${selected.enabled ? 'Activa' : 'Todas desactivadas'}</small>
          <select class="select select-sm detail-mod-version" data-mod-version-select="${esc(group.projectId)}" aria-label="Versión activa de ${esc(display)}">
            ${options}
          </select>
        </div>
        <label class="switch" title="${selected.enabled ? 'Desactivar versión seleccionada' : 'Activar versión seleccionada'}">
          <input type="checkbox" data-detail-mod-toggle="${esc(selected.file)}" ${selected.enabled ? 'checked' : ''}>
          <span class="switch-track"></span>
        </label>
        <button class="icon-btn danger" data-detail-mod-delete="${esc(selected.file)}" title="Eliminar versión seleccionada" aria-label="Eliminar ${esc(display)}">${icon('trash')}</button>
      </div>`;
  }

  function detailModsMarkup() {
    if (detailLoading) {
      return `<div class="detail-mods-state">${icon('refresh')}<span>Leyendo la carpeta de mods…</span></div>`;
    }
    if (detailModsError) {
      return `<div class="detail-mods-state error">${icon('alert')}<span>${esc(detailModsError)}</span></div>`;
    }
    if (!detailMods.length) {
      return `
        <div class="detail-mods-empty">
          <span class="detail-mods-empty-icon">${icon('box')}</span>
          <div><strong>Sin mods instalados</strong><p>Busca mods en Modrinth o añade archivos .jar desde el menú ⋯.</p></div>
          <button class="btn btn-primary btn-sm" data-detail-addmods>${icon('search')}Buscar mods</button>
        </div>`;
    }
    return groupDetailMods(detailMods).map(detailModGroupMarkup).join('');
  }

  async function normalizeDuplicateMods(mods, preferred = null) {
    let current = Array.isArray(mods) ? mods : [];
    const groups = groupDetailMods(current).filter((group) => (
      group.projectId && group.mods.filter((mod) => mod.enabled).length > 1
    ));
    for (const group of groups) {
      const preferredMod = preferred
        ? group.mods.find((mod) => mod.file === preferred.file)
        : null;
      const selected = preferredMod || group.mods.find((mod) => mod.enabled);
      if (!selected) continue;
      try {
        current = await api.mods.select({ projectId: group.projectId, file: selected.file });
      } catch {
        /* se mantiene la lista actual */
      }
    }
    return current;
  }

  function refreshDetailModsDom() {
    const list = $('#detail-mods');
    if (list) list.innerHTML = detailModsMarkup();
    const summary = $('#detail-mods-summary');
    if (summary) summary.textContent = detailModsSummary();
    const tags = $('#detail-mods-tag');
    if (tags) tags.textContent = String(groupDetailMods(detailMods).length);
  }

  function instanceModTarget(instance = detailInstance()) {
    if (!instance) return { version: '', loader: '' };
    return {
      version: String(instance.version || ''),
      loader: ['fabric', 'forge', 'neoforge', 'quilt'].includes(instance.loader) ? instance.loader : ''
    };
  }

  function normalizeModToken(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/\.disabled$/i, '')
      .replace(/\.jar$/i, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function modTokenList(value) {
    return normalizeModToken(value).split(' ').filter(Boolean);
  }

  function isModVersionToken(token) {
    return /^\d/.test(token) || /^mc\d/.test(token) || /^v\d/.test(token) ||
      ['fabric', 'forge', 'neoforge', 'quilt'].includes(token);
  }

  function installedModForProject(projectId, hit = null) {
    const id = String(projectId || '');
    if (!id) return null;
    const direct = detailMods.find((mod) => mod.projectId === id);
    if (direct) return direct;

    const candidates = [hit?.slug, hit?.title]
      .map(modTokenList)
      .filter((tokens) => tokens.length && tokens.join(' ').length >= 4);
    if (!candidates.length) return null;
    return detailMods.find((mod) => {
      const fileTokens = modTokenList(mod.file);
      if (!fileTokens.length) return false;
      return candidates.some((tokens) => {
        if (tokens.length > fileTokens.length) return false;
        for (let index = 0; index < tokens.length; index++) {
          if (fileTokens[index] !== tokens[index]) return false;
        }
        const next = fileTokens[tokens.length];
        return !next || isModVersionToken(next);
      });
    }) || null;
  }

  function isProjectInstalled(projectId, hit = null) {
    return Boolean(installedModForProject(projectId, hit));
  }

  function versionCompatibility(version, target) {
    const gameVersions = Array.isArray(version?.gameVersions) ? version.gameVersions : [];
    const loaders = Array.isArray(version?.loaders) ? version.loaders : [];
    const gameOk = !target.version || !gameVersions.length || gameVersions.includes(target.version);
    const loaderOk = !target.loader || !loaders.length || loaders.includes(target.loader);
    return { gameOk, loaderOk, compatible: gameOk && loaderOk };
  }

  function isVersionInstalled(version, project, hit = null) {
    if (!version) return false;
    const installed = installedModForProject(project?.id, hit);
    if (!installed) return false;
    if (installed.versionId) return installed.versionId === version.id;
    const file = normalizeModToken(installed.file);
    const slug = normalizeModToken(hit?.slug || project?.slug);
    const number = normalizeModToken(version.versionNumber);
    if (!slug || !number) return false;
    return file.includes(slug) && file.includes(number);
  }

  function modVersionSource() {
    return modVersionOnlyCompatible ? selectedModVersions : selectedModAllVersions;
  }

  function visibleModVersions(target) {
    return (modVersionSource() || []).filter((version) => {
      const { compatible } = versionCompatibility(version, target);
      if (modVersionOnlyCompatible && !compatible) return false;
      if (modVersionChannel !== 'all' && (version.versionType || 'release') !== modVersionChannel) return false;
      return true;
    });
  }

  async function refreshInstalledMods() {
    try {
      const mods = await api.mods.list();
      detailMods = await normalizeDuplicateMods(Array.isArray(mods) ? mods : []);
      state.mods = detailMods;
    } catch {
      /* se mantiene la lista actual */
    }
    if (detailView === 'browse') renderModBrowser();
    else if (detailView === 'mod') renderModDetail();
    return detailMods;
  }

  async function applyInstallResult(result) {
    const fresh = Array.isArray(result?.mods) ? result.mods : await api.mods.list();
    const preferredFile = result?.installed?.find((item) => item?.file)?.file || null;
    detailMods = await normalizeDuplicateMods(fresh, preferredFile ? { file: preferredFile } : null);
    state.mods = detailMods;
    App.home?.render?.();
    App.mods?.render?.();
    if (detailView === 'browse') renderModBrowser();
    else if (detailView === 'mod') renderModDetail();
    else renderDetail();
  }

  function inlineMarkdown(value) {
    const codes = [];
    let text = String(value).replace(/`([^`]+)`/g, (match, code) => {
      codes.push(code);
      return `\u0000${codes.length - 1}\u0000`;
    });
    text = text
      .replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, (match, alt, url) => `<img src="${url}" alt="${alt}" loading="lazy" referrerpolicy="no-referrer">`)
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (match, label, url) => `<a href="${url}" data-external="1" rel="noreferrer noopener">${label}</a>`)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_]+)__/g, '<strong>$1</strong>')
      .replace(/~~([^~]+)~~/g, '<del>$1</del>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    return text.replace(/\u0000(\d+)\u0000/g, (match, index) => `<code>${codes[Number(index)]}</code>`);
  }

  function renderMarkdown(markdown) {
    const cleaned = String(markdown || '')
      .replace(/\r\n?/g, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?[a-z][^>]*>/gi, '')
      .slice(0, 40000);
    if (!cleaned.trim()) return '';

    const lines = esc(cleaned).split('\n');
    const html = [];
    let list = null;
    let inCode = false;
    let code = [];
    let paragraph = [];

    const flushParagraph = () => {
      if (!paragraph.length) return;
      html.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`);
      paragraph = [];
    };
    const closeList = () => {
      if (!list) return;
      html.push(`</${list}>`);
      list = null;
    };

    for (const raw of lines) {
      const line = raw.replace(/\s+$/, '');
      if (/^```/.test(line.trim())) {
        if (inCode) {
          html.push(`<pre><code>${code.join('\n')}</code></pre>`);
          code = [];
          inCode = false;
        } else {
          flushParagraph();
          closeList();
          inCode = true;
        }
        continue;
      }
      if (inCode) {
        code.push(raw);
        continue;
      }
      if (!line.trim()) {
        flushParagraph();
        closeList();
        continue;
      }
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
        flushParagraph();
        closeList();
        html.push('<hr>');
        continue;
      }
      const heading = line.match(/^(#{1,6})\s+(.*)$/);
      if (heading) {
        flushParagraph();
        closeList();
        const level = Math.min(6, heading[1].length + 1);
        html.push(`<h${level}>${inlineMarkdown(heading[2].trim())}</h${level}>`);
        continue;
      }
      const quote = line.match(/^(?:>|&gt;)\s?(.*)$/);
      if (quote) {
        flushParagraph();
        closeList();
        html.push(`<blockquote>${inlineMarkdown(quote[1])}</blockquote>`);
        continue;
      }
      const bullet = line.match(/^[-*+]\s+(.*)$/);
      if (bullet) {
        flushParagraph();
        if (list !== 'ul') {
          closeList();
          html.push('<ul>');
          list = 'ul';
        }
        html.push(`<li>${inlineMarkdown(bullet[1])}</li>`);
        continue;
      }
      const ordered = line.match(/^\d+[.)]\s+(.*)$/);
      if (ordered) {
        flushParagraph();
        if (list !== 'ol') {
          closeList();
          html.push('<ol>');
          list = 'ol';
        }
        html.push(`<li>${inlineMarkdown(ordered[1])}</li>`);
        continue;
      }
      closeList();
      paragraph.push(line.trim());
    }

    if (inCode && code.length) html.push(`<pre><code>${code.join('\n')}</code></pre>`);
    flushParagraph();
    closeList();
    return html.join('\n');
  }

  function renderView() {
    if (detailView === 'browse') renderModBrowser();
    else if (detailView === 'mod') renderModDetail();
    else renderDetail();
  }

  async function runInstanceModSearch(reset = true) {
    const instance = detailInstance();
    if (!instance) return;
    const target = instanceModTarget(instance);
    if (!target.version) {
      toast('Asigna una versión de Minecraft a la instancia para buscar mods compatibles.', 'warning');
      renderModBrowser();
      return;
    }

    if (reset) {
      modBrowseResults = [];
      modBrowseTotal = 0;
    }
    const request = ++modBrowseRequest;
    modBrowseLoading = true;
    modBrowseError = '';
    renderModBrowser();

    await refreshInstalledMods();
    if (request !== modBrowseRequest || detailView !== 'browse') return;
    modBrowseLoading = true;
    renderModBrowser();

    try {
      const data = await api.modrinth.search({
        query: modBrowseQuery,
        gameVersion: target.version,
        loader: target.loader || undefined,
        limit: 20,
        offset: reset ? 0 : modBrowseResults.length
      });
      if (request !== modBrowseRequest) return;
      const hits = Array.isArray(data.hits) ? data.hits : [];
      modBrowseResults = reset ? hits : [...modBrowseResults, ...hits];
      modBrowseTotal = Number(data.total) || modBrowseResults.length;
    } catch (error) {
      if (request !== modBrowseRequest) return;
      modBrowseError = App.errorMessage(error);
    } finally {
      if (request === modBrowseRequest && detailView === 'browse') {
        modBrowseLoading = false;
        renderModBrowser();
      }
    }
  }

  function renderModBrowseResults(target) {
    if (modBrowseLoading && !modBrowseResults.length) {
      return `<div class="instance-mod-state">${icon('refresh')}<span>Buscando mods compatibles…</span></div>`;
    }
    if (modBrowseError) {
      return `<div class="instance-mod-state error">${icon('alert')}<span>${esc(modBrowseError)}</span><button class="btn btn-ghost btn-sm" data-mod-retry>${icon('refresh')}Reintentar</button></div>`;
    }
    if (!modBrowseResults.length) {
      return `<div class="instance-mod-state">${icon('search')}<span>No hay mods que coincidan. Prueba con otra búsqueda.</span></div>`;
    }

    const canDownload = Boolean(target.version && target.loader);
    return modBrowseResults.map((hit) => {
      const categories = (hit.categories || []).slice(0, 3)
        .map((category) => `<span class="mod-tag">${esc(category)}</span>`)
        .join('');
      const installed = isProjectInstalled(hit.id, hit);
      return `
        <article class="mod-browse-card instance-mod-card" data-mod-id="${esc(hit.id)}" tabindex="0" role="button" aria-label="Ver ${esc(hit.title)}">
          <span class="mod-browse-icon">
            ${icon('box')}
            ${hit.icon ? `<img src="${esc(hit.icon)}" alt="" referrerpolicy="no-referrer">` : ''}
          </span>
          <div class="mod-browse-main">
            <div class="mod-browse-title"><strong>${esc(hit.title)}</strong></div>
            <p>${esc(hit.description || 'Sin descripción disponible.')}</p>
            <div class="mod-browse-meta">
              <span>${icon('download')}${App.formatNumber(hit.downloads)}</span>
              ${hit.author ? `<span>${icon('user')}${esc(hit.author)}</span>` : ''}
              ${categories}
            </div>
          </div>
          ${installed
            ? `<span class="btn btn-ghost btn-sm is-installed">${icon('check')}Instalado</span>`
            : `<button class="btn btn-primary btn-sm" data-mod-download="${esc(hit.id)}" ${canDownload ? '' : 'disabled'} title="${canDownload ? 'Descargar la última versión compatible' : 'Asigna una versión y un cargador a la instancia'}">${icon('download')}Descargar</button>`}
        </article>`;
    }).join('');
  }

  function renderModBrowser() {
    const host = $('#instance-detail');
    const listView = $('#instances-list-view');
    if (!host) return;
    const instance = detailInstance();
    if (!instance) {
      closeDetail();
      return;
    }
    if (listView) listView.hidden = true;
    host.hidden = false;

    const target = instanceModTarget(instance);
    const warning = !target.version
      ? `<div class="instance-mod-warning">${icon('alert')}<span>Asigna una versión de Minecraft a esta instancia para buscar mods compatibles.</span><button class="btn btn-ghost btn-sm" data-mod-edit-target>Editar instancia</button></div>`
      : !target.loader
        ? `<div class="instance-mod-warning">${icon('alert')}<span>Esta instancia usa Vanilla. Cambia el cargador a Fabric, Forge, NeoForge o Quilt para instalar mods.</span><button class="btn btn-ghost btn-sm" data-mod-edit-target>Editar instancia</button></div>`
        : '';
    const more = modBrowseResults.length && modBrowseResults.length < modBrowseTotal
      ? `<div class="instance-mod-more"><button class="btn btn-ghost btn-sm" data-mod-load-more ${modBrowseLoading ? 'disabled' : ''}>${modBrowseLoading ? 'Cargando…' : 'Cargar más'}</button></div>`
      : '';

    host.innerHTML = `
      <div class="detail-topbar">
        <button class="btn btn-ghost btn-sm" data-mod-browser-back>${icon('chevron-left')}${esc(instance.name)}</button>
        <div class="detail-topbar-actions">
          <button class="icon-btn bordered" data-mod-browser-refresh title="Actualizar resultados" aria-label="Actualizar resultados">${icon('refresh')}</button>
        </div>
      </div>
      <section class="instance-mod-browser">
        <div class="instance-mod-head">
          <div>
            <span class="detail-eyebrow">MODRINTH</span>
            <h2>Buscar mods</h2>
            <p>Instalando en <strong>${esc(instance.name)}</strong> · ${esc(assignmentLabel(instance))}</p>
          </div>
        </div>
        ${warning}
        <form class="instance-mod-search" data-mod-search-form>
          <div class="search-box">${icon('search')}<input id="instance-mod-query" type="search" placeholder="Buscar mods: sodium, jei, create…" value="${esc(modBrowseQuery)}" autocomplete="off" spellcheck="false"></div>
          <button class="btn btn-primary" type="submit">${icon('search')}Buscar</button>
        </form>
        <div class="instance-mod-results">${renderModBrowseResults(target)}</div>
        ${more}
      </section>`;
  }

  function openModBrowser() {
    const instance = detailInstance();
    if (!instance) return;
    detailView = 'browse';
    modBrowseQuery = '';
    modBrowseResults = [];
    modBrowseError = '';
    modBrowseTotal = 0;
    modBrowseRequest++;
    modBrowseLoading = false;
    renderModBrowser();
    if (instanceModTarget(instance).version) runInstanceModSearch(true);
    else refreshInstalledMods();
  }

  async function installInstanceMod(projectId, button) {
    const instance = detailInstance();
    if (!instance) return;
    const target = instanceModTarget(instance);
    if (!target.version) {
      toast('Asigna una versión de Minecraft a la instancia antes de instalar mods.', 'warning');
      return;
    }
    if (!target.loader) {
      toast('Esta instancia es Vanilla. Cambia el cargador para poder instalar mods.', 'warning');
      return;
    }

    if (button) App.setBusy(button, true, 'Descargando…');
    try {
      const result = await api.modrinth.install({
        projectId,
        gameVersion: target.version,
        loader: target.loader
      });
      await applyInstallResult(result);
      const count = Array.isArray(result.installed) ? result.installed.length : 1;
      const extra = count > 1 ? ` y ${count - 1} dependencia${count - 1 === 1 ? '' : 's'}` : '';
      toast(`«${result.version?.name || 'Mod'}» instalado${extra}.`, 'success', 'Mod añadido');
    } catch (error) {
      toastError(App.errorMessage(error), 'No se pudo instalar el mod');
      if (button) App.setBusy(button, false);
    }
  }

  async function installInstanceModVersion(projectId, versionId, button) {
    const instance = detailInstance();
    if (!instance) return;
    const target = instanceModTarget(instance);
    if (!target.version) {
      toast('Asigna una versión de Minecraft a la instancia antes de instalar mods.', 'warning');
      return;
    }
    if (!target.loader) {
      toast('Esta instancia es Vanilla. Cambia el cargador para poder instalar mods.', 'warning');
      return;
    }

    const project = selectedModProject;
    const hit = selectedModHit;
    const source = modVersionSource();
    const version = (source || []).find((item) => item.id === versionId);
    if (!version) {
      toastError('No se encontró esa versión del mod.');
      return;
    }

    const compatibility = versionCompatibility(version, target);
    if (!compatibility.compatible) {
      const label = version.name || version.versionNumber || 'Esta versión';
      const confirmed = await App.confirmDialog({
        title: 'Versión incompatible',
        message: `«${label}» no está marcada como compatible con Minecraft ${target.version} · ${App.loaderLabel(target.loader)}. Instalarla podría impedir que el juego arranque. ¿Quieres instalarla igualmente?`,
        confirm: 'Instalar igualmente',
        danger: true,
        icon: 'alert'
      });
      if (!confirmed) return;
    }

    const installTarget = compatibility.compatible
      ? target
      : {
          version: (version.gameVersions || [])[0] || target.version,
          loader: (version.loaders || []).find((loader) => ['fabric', 'forge', 'neoforge', 'quilt'].includes(loader)) || target.loader
        };

    if (button) App.setBusy(button, true, 'Descargando…');
    try {
      const result = await api.modrinth.install({
        projectId: projectId || project?.id,
        versionId,
        gameVersion: installTarget.version,
        loader: installTarget.loader
      });
      await applyInstallResult(result);
      const count = Array.isArray(result.installed) ? result.installed.length : 1;
      const extra = count > 1 ? ` y ${count - 1} dependencia${count - 1 === 1 ? '' : 's'}` : '';
      toast(`«${result.version?.name || version.name || 'Mod'}» instalado${extra}.`, 'success', 'Mod añadido');
    } catch (error) {
      toastError(App.errorMessage(error), 'No se pudo instalar el mod');
      if (button) App.setBusy(button, false);
    }
  }

  async function openInstanceMod(projectId) {
    const id = String(projectId || '');
    if (!id) return;

    selectedModId = id;
    selectedModHit = modBrowseResults.find((hit) => hit.id === id) || null;
    selectedModProject = null;
    selectedModError = '';
    selectedModLoading = true;
    selectedModVersions = [];
    selectedModVersionsError = '';
    selectedModVersionsLoading = true;
    selectedModAllVersions = [];
    selectedModAllVersionsError = '';
    selectedModAllVersionsLoading = false;
    selectedModAllVersionsLoaded = false;
    modVersionOnlyCompatible = true;
    modVersionChannel = 'all';
    selectedModTab = 'description';
    detailView = 'mod';
    renderModDetail();

    const target = instanceModTarget();
    const [projectResult, versionsResult] = await Promise.allSettled([
      api.modrinth.project({ projectId: id }),
      api.modrinth.versions({
        projectId: id,
        gameVersion: target.version || undefined,
        loader: target.loader || undefined
      })
    ]);
    if (selectedModId !== id) return;

    if (projectResult.status === 'fulfilled') selectedModProject = projectResult.value?.project || null;
    else selectedModError = App.errorMessage(projectResult.reason);
    selectedModLoading = false;

    if (versionsResult.status === 'fulfilled') {
      selectedModVersions = Array.isArray(versionsResult.value?.versions) ? versionsResult.value.versions : [];
    } else {
      selectedModVersionsError = App.errorMessage(versionsResult.reason);
    }
    selectedModVersionsLoading = false;
    renderModDetail();
  }

  async function loadAllModVersions() {
    const id = selectedModId;
    if (!id) return;
    if (selectedModAllVersionsLoaded) {
      renderModDetail();
      return;
    }
    selectedModAllVersionsLoading = true;
    selectedModAllVersionsError = '';
    renderModDetail();

    try {
      const data = await api.modrinth.versions({ projectId: id });
      if (selectedModId !== id) return;
      selectedModAllVersions = Array.isArray(data?.versions) ? data.versions : [];
      selectedModAllVersionsLoaded = true;
    } catch (error) {
      if (selectedModId !== id) return;
      selectedModAllVersionsError = App.errorMessage(error);
    } finally {
      if (selectedModId === id) {
        selectedModAllVersionsLoading = false;
        renderModDetail();
      }
    }
  }

  function renderModVersionRow(version, project, hit, target, canDownload) {
    const compatibility = versionCompatibility(version, target);
    const installed = isVersionInstalled(version, project, hit);
    const channel = ['release', 'beta', 'alpha'].includes(version.versionType) ? version.versionType : 'release';
    const details = [
      version.versionNumber,
      (version.gameVersions || []).slice(0, 4).join(', '),
      (version.loaders || []).slice(0, 3).join(', '),
      version.datePublished ? App.formatDate(version.datePublished) : ''
    ].filter(Boolean).join(' · ') || 'Sin detalles';
    const warning = compatibility.compatible
      ? ''
      : `<span class="mod-version-warn" title="No compatible con Minecraft ${esc(target.version || '—')}${target.loader ? ` · ${esc(App.loaderLabel(target.loader))}` : ''}">${icon('alert')}</span>`;

    return `
      <div class="mod-version-row${compatibility.compatible ? '' : ' incompatible'}${installed ? ' installed' : ''}">
        <div class="mod-version-main">
          <strong>${esc(version.name || version.versionNumber || 'Versión sin nombre')}</strong>
          <small>${esc(details)}</small>
        </div>
        <span class="mod-version-channel ${channel}">${channel}</span>
        ${version.downloads ? `<span class="mod-tag">${App.formatNumber(version.downloads)} descargas</span>` : ''}
        <div class="mod-version-actions">
          ${installed
            ? `<span class="btn btn-ghost btn-sm is-installed">${icon('check')}Instalado</span>`
            : `${warning}<button class="btn btn-primary btn-sm" data-mod-version-project="${esc(project.id)}" data-mod-version-install="${esc(version.id)}" ${canDownload ? '' : 'disabled'} title="${canDownload ? 'Descargar esta versión' : 'Asigna una versión y un cargador a la instancia'}">${icon('download')}Descargar</button>`}
        </div>
      </div>`;
  }

  function renderModDetailPanel(project, target, hit = selectedModHit || {}) {
    if (selectedModTab === 'gallery') {
      const gallery = project.gallery || [];
      if (!gallery.length) {
        return `<div class="instance-mod-state">${icon('image')}<span>El autor no ha añadido imágenes a la galería.</span></div>`;
      }
      return `<div class="mod-gallery">${gallery.map((image, index) => `
        <button class="mod-gallery-item" data-mod-gallery-index="${index}" title="${esc(image.title || 'Ampliar imagen')}">
          <img src="${esc(image.url)}" alt="${esc(image.title || project.title)}" loading="lazy" referrerpolicy="no-referrer">
          ${image.title ? `<span>${esc(image.title)}</span>` : ''}
        </button>`).join('')}</div>`;
    }

    if (selectedModTab === 'versions') {
      const loadingAll = !modVersionOnlyCompatible && selectedModAllVersionsLoading && !selectedModAllVersions.length;
      if (selectedModVersionsLoading || loadingAll) {
        return `<div class="instance-mod-state">${icon('refresh')}<span>${modVersionOnlyCompatible ? 'Buscando versiones compatibles…' : 'Cargando todas las versiones…'}</span></div>`;
      }
      const error = modVersionOnlyCompatible ? selectedModVersionsError : selectedModAllVersionsError;
      if (error) {
        return `<div class="instance-mod-state error">${icon('alert')}<span>${esc(error)}</span></div>`;
      }

      const canDownload = Boolean(target.version && target.loader);
      const versions = visibleModVersions(target);
      const filters = `
        <div class="mod-version-filters">
          <label class="check-row mod-version-compat">
            <input type="checkbox" data-mod-version-compatible ${modVersionOnlyCompatible ? 'checked' : ''}>
            <span>Solo compatibles</span>
          </label>
          <div class="select-wrap">
            <select class="select select-sm" data-mod-version-channel aria-label="Filtrar por canal">
              <option value="all" ${modVersionChannel === 'all' ? 'selected' : ''}>Todos los canales</option>
              <option value="release" ${modVersionChannel === 'release' ? 'selected' : ''}>Release</option>
              <option value="beta" ${modVersionChannel === 'beta' ? 'selected' : ''}>Beta</option>
              <option value="alpha" ${modVersionChannel === 'alpha' ? 'selected' : ''}>Alpha</option>
            </select>
          </div>
        </div>`;
      const note = modVersionOnlyCompatible
        ? `Versiones compatibles con Minecraft ${esc(target.version || '—')}${target.loader ? ` · ${esc(App.loaderLabel(target.loader))}` : ''}.`
        : `Todas las versiones del proyecto. Las marcadas con ${icon('alert')} no son compatibles con esta instancia.`;

      if (!versions.length) {
        return `${filters}<div class="instance-mod-state">${icon('box')}<span>No hay versiones que coincidan con los filtros.</span></div>`;
      }
      return `
        ${filters}
        <p class="mod-version-note">${note}</p>
        <div class="mod-version-list">${versions.map((version) => renderModVersionRow(version, project, hit, target, canDownload)).join('')}</div>`;
    }

    const body = renderMarkdown(project.body || '');
    if (body) return `<div class="mod-markdown">${body}</div>`;
    return `<div class="instance-mod-state">${icon('info')}<span>El autor no ha añadido una descripción larga.</span></div>`;
  }

  function renderModDetail() {
    const host = $('#instance-detail');
    const listView = $('#instances-list-view');
    if (!host) return;
    if (!detailInstance()) {
      closeDetail();
      return;
    }
    if (listView) listView.hidden = true;
    host.hidden = false;

    if (selectedModLoading && !selectedModProject) {
      host.innerHTML = `
        <div class="detail-topbar">
          <button class="btn btn-ghost btn-sm" data-mod-detail-back>${icon('chevron-left')}Buscar mods</button>
        </div>
        <div class="instance-mod-state">${icon('refresh')}<span>Leyendo la ficha del mod en Modrinth…</span></div>`;
      return;
    }

    if (selectedModError || !selectedModProject) {
      host.innerHTML = `
        <div class="detail-topbar">
          <button class="btn btn-ghost btn-sm" data-mod-detail-back>${icon('chevron-left')}Buscar mods</button>
        </div>
        <div class="instance-mod-state error">${icon('alert')}<span>${esc(selectedModError || 'No se pudo cargar la información del mod.')}</span><button class="btn btn-ghost btn-sm" data-mod-retry-project="${esc(selectedModId)}">${icon('refresh')}Reintentar</button></div>`;
      return;
    }

    const project = selectedModProject;
    const hit = { slug: project.slug, title: project.title, ...(selectedModHit || {}) };
    const target = instanceModTarget();
    const canDownload = Boolean(target.version && target.loader);
    const projectInstalled = isProjectInstalled(project.id, hit);
    const tabs = [
      ['description', 'Descripción', 0],
      ['gallery', 'Galería', (project.gallery || []).length],
      ['versions', 'Versiones', selectedModVersions.length]
    ].map(([key, label, count]) => `
      <button class="seg-btn${selectedModTab === key ? ' active' : ''}" data-mod-tab="${key}" role="tab">
        ${label}${count ? ` <span class="seg-count">${count}</span>` : ''}
      </button>`).join('');

    host.innerHTML = `
      <div class="detail-topbar">
        <button class="btn btn-ghost btn-sm" data-mod-detail-back>${icon('chevron-left')}Buscar mods</button>
        <div class="detail-topbar-actions">
          ${project.slug ? `<button class="btn btn-ghost btn-sm" data-mod-open-external="${esc(project.slug)}">${icon('external')}Ver en Modrinth</button>` : ''}
        </div>
      </div>
      <section class="instance-mod-detail">
        <div class="mod-detail-hero">
          <span class="mod-browse-icon xlarge">
            ${icon('box')}
            ${project.icon ? `<img src="${esc(project.icon)}" alt="" referrerpolicy="no-referrer">` : ''}
          </span>
          <div class="mod-detail-hero-main">
            <span class="detail-eyebrow">MODRINTH</span>
            <h2>${esc(project.title || hit.title || 'Mod')}</h2>
            <p>${esc(project.description || hit.description || 'Sin descripción disponible.')}</p>
            <div class="detail-tags">
              <span class="detail-tag">${icon('download')}${App.formatNumber(project.downloads || 0)} descargas</span>
              ${hit.author ? `<span class="detail-tag">${icon('user')}${esc(hit.author)}</span>` : ''}
              <span class="detail-tag">${icon('layers')}${esc(target.version || 'Sin versión')} · ${esc(target.loader ? App.loaderLabel(target.loader) : 'Vanilla')}</span>
              ${project.updated ? `<span class="detail-tag">${icon('clock')}${esc(App.formatDate(project.updated))}</span>` : ''}
              ${(project.categories || []).slice(0, 4).map((category) => `<span class="mod-tag">${esc(category)}</span>`).join('')}
            </div>
            <div class="detail-actions">
              ${projectInstalled
                ? `<span class="btn btn-ghost is-installed">${icon('check')}Instalado</span><span class="mod-installed-hint">Cambia de versión en la pestaña Versiones.</span>`
                : `<button class="btn btn-primary" data-mod-download="${esc(project.id)}" ${canDownload ? '' : 'disabled'} title="${canDownload ? 'Descargar la última versión compatible' : 'Asigna una versión y un cargador a la instancia'}">${icon('download')}Descargar última compatible</button>`}
            </div>
          </div>
        </div>
        <div class="segmented mod-detail-tabs" role="tablist">${tabs}</div>
        <div class="mod-detail-panel">${renderModDetailPanel(project, target, hit)}</div>
      </section>`;
  }

  function openGalleryImage(index) {
    const project = selectedModProject;
    const image = project?.gallery?.[index];
    if (!image) return;
    App.openModal(`
      ${App.modalHead('GALERÍA', image.title || project.title || 'Imagen', image.description || '')}
      <div class="mod-gallery-lightbox"><img src="${esc(image.full || image.url)}" alt="${esc(image.title || project.title || 'Imagen')}" referrerpolicy="no-referrer"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-modal-close>Cerrar</button>
      </div>`, { wide: true });
  }

  function renderDetail() {
    const host = $('#instance-detail');
    const listView = $('#instances-list-view');
    if (!host) return;
    const instance = detailInstance();
    if (!instance) {
      closeDetail();
      return;
    }
    if (listView) listView.hidden = true;
    host.hidden = false;

    const active = instance.id === state.activeInstanceId;
    const description = String(instance.description || '').trim();
    const lastPlayed = instance.lastPlayedAt ? App.relativeDate(instance.lastPlayedAt) : 'Nunca';

    host.innerHTML = `
      <div class="detail-topbar">
        <button class="btn btn-ghost btn-sm" data-detail-back>${icon('chevron-left')}Instancias</button>
        <div class="detail-topbar-actions">
          <button class="icon-btn bordered" data-detail-cover-pick title="Cambiar carátula" aria-label="Cambiar carátula">${icon('image')}</button>
          <button class="icon-btn bordered" data-detail-settings title="Ajustes de la instancia" aria-label="Ajustes de la instancia">${icon('settings')}</button>
          <div class="detail-menu-wrap">
            <button class="icon-btn bordered" data-detail-more aria-haspopup="menu" aria-expanded="false" title="Más opciones" aria-label="Más opciones">${icon('more')}</button>
            <div class="detail-menu" data-detail-menu role="menu" hidden>
              <button role="menuitem" data-detail-action="open">${icon('folder')}<span>Abrir carpeta</span></button>
              <button role="menuitem" data-detail-action="log">${icon('terminal')}<span>Abrir latest.log</span></button>
              <button role="menuitem" data-detail-action="analyze">${icon('alert')}<span>Analizar crash</span></button>
              <button role="menuitem" data-detail-action="add-file">${icon('plus')}<span>Añadir mod desde archivo</span></button>
              <div class="detail-menu-sep"></div>
              <button role="menuitem" data-detail-action="edit">${icon('edit')}<span>Editar versión y cargador</span></button>
              <button role="menuitem" data-detail-action="meta">${icon('sparkles')}<span>Editar nombre y descripción</span></button>
              <button role="menuitem" data-detail-action="verify">${icon('shield')}<span>Verificar y reparar</span></button>
              <button role="menuitem" data-detail-action="export">${icon('archive')}<span>Exportar modpack</span></button>
              <button role="menuitem" data-detail-action="duplicate">${icon('copy')}<span>Duplicar instancia</span></button>
              ${instance.cover ? `<button role="menuitem" data-detail-action="cover-remove">${icon('x')}<span>Quitar carátula</span></button>` : ''}
              <div class="detail-menu-sep"></div>
              <button role="menuitem" class="danger" data-detail-action="delete">${icon('trash')}<span>Eliminar instancia</span></button>
            </div>
          </div>
        </div>
      </div>

      <div class="detail-hero">
        <button class="detail-cover${instance.cover ? ' has-image' : ''}" data-detail-cover-pick title="${instance.cover ? 'Cambiar carátula' : 'Añadir carátula'}">
          ${instance.cover
            ? `<img src="${esc(instance.cover)}" alt="Carátula de ${esc(instance.name)}">`
            : `<span class="detail-cover-empty">${icon('image')}<small>Añadir carátula</small></span>`}
        </button>
        <div class="detail-info">
          <div class="detail-title-row">
            <div>
              <span class="detail-eyebrow">${active ? 'INSTANCIA ACTIVA' : 'INSTANCIA'}</span>
              <h2>${esc(instance.name)}</h2>
            </div>
            <button class="icon-btn bordered" data-detail-meta title="Editar nombre y descripción" aria-label="Editar nombre y descripción">${icon('edit')}</button>
          </div>
          <p class="detail-description${description ? '' : ' empty'}">${description ? esc(description) : 'Añade una descripción para identificar esta instancia.'}</p>
          <div class="detail-tags">
            <span class="detail-tag">${icon('layers')}${esc(assignmentLabel(instance))}</span>
            <span class="detail-tag">${icon('box')}<b id="detail-mods-tag">${groupDetailMods(detailMods).length}</b> mods</span>
            <span class="detail-tag">${icon('clock')}${esc(lastPlayed)}</span>
            ${instance.exists ? '' : `<span class="detail-tag warn">${icon('alert')}Carpeta no encontrada</span>`}
          </div>
          <div class="detail-actions">
            <button class="btn btn-primary" data-detail-play>${icon('play')}Jugar</button>
            <button class="btn btn-ghost" data-detail-addmods>${icon('search')}Buscar mods</button>
          </div>
        </div>
      </div>

      <section class="detail-section">
        <div class="detail-section-head">
          <div>
            <h3>Mods instalados</h3>
            <p id="detail-mods-summary">${esc(detailModsSummary())}</p>
          </div>
          <div class="detail-section-actions">
            <button class="btn btn-ghost btn-sm" data-detail-open-mods>${icon('folder')}Abrir carpeta</button>
            <button class="btn btn-ghost btn-sm" data-detail-addmods>${icon('search')}Buscar mods</button>
          </div>
        </div>
        <div class="detail-mods" id="detail-mods">${detailModsMarkup()}</div>
      </section>`;
  }

  function render() {
    const grid = $('#instances-grid');
    if (!grid) return;
    const list = state.instances || [];
    const active = activeInstance();

    const name = $('#active-instance-name');
    if (name) name.textContent = active?.name || '—';
    const pathLabel = $('#active-instance-path');
    if (pathLabel) {
      pathLabel.textContent = active?.gameRoot || '—';
      pathLabel.title = active?.gameRoot || '';
    }
    const assignment = $('#active-instance-assignment');
    if (assignment) assignment.textContent = active ? assignmentLabel(active) : '—';

    const empty = $('#instances-empty');
    if (empty) empty.hidden = list.length > 0;
    grid.innerHTML = list.map(instanceCard).join('');

    if (detailId) renderView();
  }

  function closeDetail() {
    detailId = null;
    detailMods = [];
    detailModsError = '';
    detailLoading = false;
    detailView = 'detail';
    modBrowseQuery = '';
    modBrowseResults = [];
    modBrowseLoading = false;
    modBrowseError = '';
    modBrowseTotal = 0;
    modBrowseRequest++;
    selectedModId = null;
    selectedModHit = null;
    selectedModProject = null;
    selectedModError = '';
    selectedModLoading = false;
    selectedModVersions = [];
    selectedModVersionsLoading = false;
    selectedModVersionsError = '';
    selectedModTab = 'description';
    const host = $('#instance-detail');
    const listView = $('#instances-list-view');
    if (host) {
      host.hidden = true;
      host.innerHTML = '';
    }
    if (listView) listView.hidden = false;
  }

  async function openDetail(id) {
    const instance = state.instances.find((item) => item.id === id);
    if (!instance) return;
    detailId = id;
    detailMods = [];
    detailModsError = '';
    detailLoading = true;
    detailView = 'detail';
    App.go('instances');
    renderView();

    try {
      if (state.activeInstanceId !== id) {
        const data = await api.instances.select(id);
        App.applyInstanceState(data);
      }
      detailMods = await normalizeDuplicateMods(await api.mods.list());
      state.mods = detailMods;
    } catch (error) {
      detailModsError = App.errorMessage(error);
    } finally {
      detailLoading = false;
      if (detailId === id) renderView();
    }
    App.home?.render?.();
  }

  async function selectInstance(id) {
    if (state.activeInstanceId === id) return true;
    const data = await api.instances.select(id);
    App.applyInstanceState(data);
    const instance = state.instances.find((item) => item.id === id);
    if (instance) toast(`Instancia «${instance.name}» activa.`, 'success', 'Instancia cambiada');
    return true;
  }

  function versionOptions(selected) {
    const installed = (state.localVersions || [])
      .filter((version) => App.isBaseVersion(version))
      .map((version) => version.id);
    const installedIds = new Set(installed);
    const available = (state.remote?.versions || [])
      .filter((version) => version.type === 'release' || (state.settings?.showSnapshots && version.type === 'snapshot'))
      .map((version) => version.id)
      .filter((id) => !installedIds.has(id))
      .slice(0, 80);

    const parts = [];
    const known = new Set([...installed, ...available]);
    if (selected && !known.has(selected)) {
      parts.push(`<option value="${esc(selected)}">${esc(selected)}</option>`);
    }
    if (installed.length) {
      parts.push(`<optgroup label="Instaladas">${installed.map((id) => `<option value="${esc(id)}">${esc(id)}</option>`).join('')}</optgroup>`);
    }
    if (available.length) {
      parts.push(`<optgroup label="Disponibles">${available.map((id) => `<option value="${esc(id)}">${esc(id)}</option>`).join('')}</optgroup>`);
    }
    if (!parts.length) parts.push('<option value="">No hay versiones disponibles</option>');
    return parts.join('');
  }

  async function refreshLoaderVersions(modal, { loader, mcVersion, preferred = '' }) {
    const field = modal.querySelector('#instance-loader-version-field');
    const select = modal.querySelector('#instance-loader-version');
    const hint = modal.querySelector('#instance-loader-hint');
    if (!field || !select) return;

    if (loader === 'vanilla' || !mcVersion) {
      field.hidden = true;
      if (hint) {
        hint.classList.remove('warn');
        hint.textContent = loader === 'vanilla'
          ? 'Solo Minecraft Vanilla. Elige un cargador para poder usar mods.'
          : 'Elige una versión de Minecraft para ver las versiones del cargador.';
      }
      return;
    }

    field.hidden = false;
    select.disabled = true;
    select.innerHTML = '<option value="">Cargando versiones…</option>';
    if (hint) {
      hint.classList.remove('warn');
      hint.textContent = `Buscando versiones de ${App.loaderLabel(loader)} para Minecraft ${mcVersion}…`;
    }

    try {
      const key = `${loader}:${mcVersion}`;
      const data = state.loaderVersions[key] || await api.loaders.versions({ loader, mcVersion });
      state.loaderVersions[key] = data;
      const versions = Array.isArray(data?.versions) ? data.versions : [];
      if (!versions.length) {
        select.innerHTML = '<option value="">Sin versiones compatibles</option>';
        select.disabled = true;
        if (hint) {
          hint.classList.add('warn');
          hint.textContent = `${App.loaderLabel(loader)} no tiene versiones para Minecraft ${mcVersion}.`;
        }
        return;
      }

      select.innerHTML = versions.map((item) => {
        const tags = [];
        if (item.installed) tags.push('instalada');
        if (item.recommended) tags.push('recomendada');
        else if (item.latest) tags.push('última');
        if (item.stable === false) tags.push('beta');
        return `<option value="${esc(item.version)}">${esc(item.version)}${tags.length ? ` · ${esc(tags.join(' · '))}` : ''}</option>`;
      }).join('');

      const chosen = [preferred, data.defaultVersion, versions[0].version]
        .find((value) => value && versions.some((item) => item.version === value));
      select.value = chosen || versions[0].version;
      select.disabled = false;
      if (hint) {
        hint.classList.remove('warn');
        hint.textContent = `${App.loaderLabel(loader)} ${select.value} se instalará automáticamente al pulsar Jugar.`;
      }
    } catch (error) {
      select.innerHTML = '<option value="">No disponible</option>';
      select.disabled = true;
      if (hint) {
        hint.classList.add('warn');
        hint.textContent = App.errorMessage(error);
      }
    }
  }

  function openInstanceModal(instance = null) {
    const editing = Boolean(instance);
    const selectedVersion = instance?.version || state.settings?.lastVersion || '';
    const selectedLoader = instance?.loader || 'vanilla';
    const selectedLoaderVersion = instance?.loaderVersion || '';

    const modal = App.openModal(`
      ${App.modalHead(
        editing ? 'EDITAR INSTANCIA' : 'NUEVA INSTANCIA',
        editing ? 'Versión y cargador' : 'Crear instancia',
        editing
          ? 'La instancia conservará sus mods, mundos y ajustes.'
          : 'Tendrá su propia carpeta con versiones, mods, mundos y ajustes.'
      )}
      <div class="modal-form">
        <label class="field-label" for="instance-name">Nombre</label>
        <input class="text-input" id="instance-name" type="text" maxlength="40" value="${editing ? esc(instance.name) : ''}" placeholder="Ej. Mods 1.20.1, Vanilla, Creaciones" autocomplete="off">

        <div class="instance-version-grid">
          <div class="launch-field">
            <label class="launch-label" for="instance-version">VERSIÓN DE MINECRAFT</label>
            <div class="select-wrap">
              <select id="instance-version" class="select">${versionOptions(selectedVersion)}</select>
              <svg class="icon select-caret"><use href="#i-chevron-down"></use></svg>
            </div>
          </div>
          <div class="launch-field">
            <label class="launch-label" for="instance-loader">CARGADOR</label>
            <div class="select-wrap">
              <select id="instance-loader" class="select">
                ${LOADERS.map((id) => `<option value="${id}"${id === selectedLoader ? ' selected' : ''}>${esc(App.loaderLabel(id))}</option>`).join('')}
              </select>
              <svg class="icon select-caret"><use href="#i-chevron-down"></use></svg>
            </div>
          </div>
        </div>

        <div class="launch-field" id="instance-loader-version-field">
          <label class="launch-label" for="instance-loader-version">VERSIÓN DEL CARGADOR</label>
          <div class="select-wrap">
            <select id="instance-loader-version" class="select"></select>
            <svg class="icon select-caret"><use href="#i-chevron-down"></use></svg>
          </div>
        </div>
        <p class="form-hint" id="instance-loader-hint"></p>

        ${editing ? '' : `
        <div class="instance-folder-row">
          <div>
            <span class="field-label">Carpeta</span>
            <span class="instance-folder-value" id="instance-folder-value">Automática dentro de los datos del launcher</span>
          </div>
          <button class="btn btn-ghost btn-sm" data-instance-pick>Elegir…</button>
        </div>
        <p class="form-hint">Si eliges una carpeta existente, se usará tal cual. No se borra nada al crearla.</p>`}
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-modal-close>Cancelar</button>
        <button class="btn btn-primary" data-instance-save>${editing ? 'Guardar cambios' : `${icon('plus')}Crear instancia`}</button>
      </div>`);

    const versionSelect = modal.querySelector('#instance-version');
    const loaderSelect = modal.querySelector('#instance-loader');
    const loaderVersionSelect = modal.querySelector('#instance-loader-version');
    const hint = modal.querySelector('#instance-loader-hint');
    const folderLabel = modal.querySelector('#instance-folder-value');
    let directory = '';

    if (versionSelect) versionSelect.value = selectedVersion || versionSelect.value;
    if (loaderSelect) loaderSelect.value = selectedLoader;

    const syncLoaderVersions = (preferred) => refreshLoaderVersions(modal, {
      loader: loaderSelect?.value || 'vanilla',
      mcVersion: versionSelect?.value || '',
      preferred: preferred ?? (loaderVersionSelect?.value || '')
    });
    syncLoaderVersions(selectedLoaderVersion);

    if (!state.remote) {
      const loading = App.home?.loadRemote?.(false);
      loading?.then?.(() => {
        if (!modal.isConnected) return;
        const current = versionSelect?.value || '';
        if (versionSelect) {
          versionSelect.innerHTML = versionOptions(current || selectedVersion);
          versionSelect.value = current || selectedVersion || versionSelect.value;
        }
        if (!current) syncLoaderVersions(selectedLoaderVersion);
      })?.catch?.(() => {
        /* el catálogo local sigue siendo válido */
      });
    }

    versionSelect?.addEventListener('change', () => syncLoaderVersions(''));
    loaderSelect?.addEventListener('change', () => syncLoaderVersions(''));

    loaderVersionSelect?.addEventListener('change', () => {
      if (!hint) return;
      const loader = loaderSelect?.value || 'vanilla';
      if (loader === 'vanilla') return;
      hint.classList.remove('warn');
      hint.textContent = `${App.loaderLabel(loader)} ${loaderVersionSelect.value} se instalará automáticamente al pulsar Jugar.`;
    });

    modal.querySelector('[data-instance-pick]')?.addEventListener('click', async () => {
      try {
        const result = await api.instances.pickFolder();
        if (!result || result.canceled || !result.directory) return;
        directory = result.directory;
        if (folderLabel) {
          folderLabel.textContent = directory;
          folderLabel.title = directory;
        }
      } catch (error) {
        toastError(App.errorMessage(error), 'No se pudo elegir la carpeta');
      }
    });

    const submit = async () => {
      const input = modal.querySelector('#instance-name');
      const name = String(input?.value || '').trim();
      if (!name) {
        input?.focus();
        toast('Ponle un nombre a la instancia.', 'warning');
        return;
      }
      const version = versionSelect?.value || '';
      if (!version) {
        toast('Elige una versión de Minecraft para la instancia.', 'warning');
        return;
      }
      const loader = loaderSelect?.value || 'vanilla';
      const loaderVersion = loader === 'vanilla' ? '' : (loaderVersionSelect?.value || '');
      if (loader !== 'vanilla' && !loaderVersion) {
        const pending = /cargando/i.test(loaderVersionSelect?.options?.[0]?.textContent || '');
        if (pending) {
          toast('Espera a que carguen las versiones del cargador.', 'info');
          return;
        }
        if (!loaderVersionSelect?.disabled) {
          toast('Elige una versión del cargador.', 'warning');
          return;
        }
      }

      const button = modal.querySelector('[data-instance-save]');
      App.setBusy(button, true, editing ? 'Guardando…' : 'Creando…');
      try {
        const payload = { name, version, loader, loaderVersion };
        const data = editing
          ? await api.instances.update({ ...payload, id: instance.id })
          : await api.instances.create({ ...payload, directory: directory || undefined });
        if (!editing) closeDetail();
        App.applyInstanceState(data);
        App.closeModal();
        App.go('instances');
        toast(
          editing ? 'Instancia actualizada.' : `Instancia «${name}» creada.`,
          'success',
          editing ? 'Cambios guardados' : 'Instancia lista'
        );
      } catch (error) {
        toastError(App.errorMessage(error), editing ? 'No se pudo actualizar' : 'No se pudo crear la instancia');
        App.setBusy(button, false);
      }
    };

    modal.querySelector('[data-instance-save]')?.addEventListener('click', submit);
    modal.querySelector('#instance-name')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') submit();
    });
  }

  function openMetaModal(instance) {
    const modal = App.openModal(`
      ${App.modalHead(
        'EDITAR INSTANCIA',
        'Nombre y descripción',
        'La descripción es opcional y se muestra en la tarjeta de la instancia.'
      )}
      <div class="modal-form">
        <label class="field-label" for="instance-meta-name">Nombre</label>
        <input class="text-input" id="instance-meta-name" type="text" maxlength="40" value="${esc(instance.name)}" autocomplete="off">
        <label class="field-label" for="instance-meta-desc">Descripción <span class="field-optional">Opcional</span></label>
        <textarea class="text-input textarea" id="instance-meta-desc" rows="4" maxlength="500" placeholder="Ej. Mods técnicos, mundo compartido con amigos…">${esc(instance.description || '')}</textarea>
        <p class="form-hint"><span id="instance-meta-count">${String(instance.description || '').length}</span>/500 caracteres</p>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-modal-close>Cancelar</button>
        <button class="btn btn-primary" data-instance-meta-save>${icon('check')}Guardar cambios</button>
      </div>`);

    const nameInput = modal.querySelector('#instance-meta-name');
    const descInput = modal.querySelector('#instance-meta-desc');
    const count = modal.querySelector('#instance-meta-count');
    descInput?.addEventListener('input', () => {
      if (count) count.textContent = String(descInput.value.length);
    });

    const submit = async () => {
      const name = String(nameInput?.value || '').trim();
      if (!name) {
        nameInput?.focus();
        toast('Ponle un nombre a la instancia.', 'warning');
        return;
      }
      const button = modal.querySelector('[data-instance-meta-save]');
      App.setBusy(button, true, 'Guardando…');
      try {
        const data = await api.instances.update({
          id: instance.id,
          name,
          description: String(descInput?.value || '').trim()
        });
        App.applyInstanceState(data);
        App.closeModal();
        toast('Nombre y descripción guardados.', 'success', 'Instancia actualizada');
      } catch (error) {
        toastError(App.errorMessage(error), 'No se pudo actualizar la instancia');
        App.setBusy(button, false);
      }
    };

    modal.querySelector('[data-instance-meta-save]')?.addEventListener('click', submit);
    nameInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') submit();
    });
  }

  async function pickDetailCover(instance) {
    try {
      const result = await api.instances.pickCover();
      if (!result || result.canceled || !result.cover) return;
      const data = await api.instances.update({ id: instance.id, cover: result.cover });
      App.applyInstanceState(data);
      toast('Carátula actualizada.', 'success', 'Instancia actualizada');
    } catch (error) {
      toastError(App.errorMessage(error), 'No se pudo cambiar la carátula');
    }
  }

  async function removeDetailCover(instance) {
    try {
      const data = await api.instances.update({ id: instance.id, cover: '' });
      App.applyInstanceState(data);
      toast('Carátula eliminada.', 'success', 'Instancia actualizada');
    } catch (error) {
      toastError(App.errorMessage(error), 'No se pudo quitar la carátula');
    }
  }

  async function addDetailMods() {
    try {
      const result = await api.mods.pick();
      if (!result || result.canceled) return;
      const fresh = Array.isArray(result.mods) ? result.mods : await api.mods.list();
      const preferredFile = result?.added?.[0] || null;
      detailMods = await normalizeDuplicateMods(fresh, preferredFile ? { file: preferredFile } : null);
      state.mods = detailMods;
      refreshDetailModsDom();
      App.home?.render?.();
      const added = result.added?.length || 0;
      const skipped = result.skipped?.length || 0;
      if (added && skipped) toast(`${added} mod${added === 1 ? '' : 's'} añadido${added === 1 ? '' : 's'}. ${skipped} archivo${skipped === 1 ? '' : 's'} no válido${skipped === 1 ? '' : 's'}.`, 'warning', 'Añadido con avisos');
      else if (added) toast(`${added} mod${added === 1 ? '' : 's'} añadido${added === 1 ? '' : 's'} a la instancia.`, 'success', 'Mods añadidos');
      else if (skipped) toast('Los archivos no son .jar válidos o superan el tamaño máximo.', 'error', 'Nada añadido');
    } catch (error) {
      toastError(App.errorMessage(error), 'No se pudieron añadir los mods');
    }
  }

  async function toggleDetailMod(file, input) {
    if (input) input.disabled = true;
    try {
      const mod = detailMods.find((item) => item.file === file);
      const group = mod?.projectId
        ? detailMods.filter((item) => item.projectId === mod.projectId)
        : [];
      const enabling = input ? input.checked : !mod?.enabled;
      detailMods = (group.length > 1 && enabling && mod?.projectId)
        ? await api.mods.select({ projectId: mod.projectId, file })
        : await api.mods.toggle(file);
      state.mods = detailMods;
      refreshDetailModsDom();
      App.home?.render?.();
      App.mods?.render?.();
    } catch (error) {
      if (input) {
        input.checked = !input.checked;
        input.disabled = false;
      }
      toastError(App.errorMessage(error), 'No se pudo cambiar el mod');
    }
  }

  async function selectDetailModVersion(projectId, file, select) {
    if (!projectId || !file) return;
    if (select) select.disabled = true;
    try {
      detailMods = await api.mods.select({ projectId, file });
      state.mods = detailMods;
      refreshDetailModsDom();
      App.home?.render?.();
      App.mods?.render?.();
    } catch (error) {
      if (select) select.disabled = false;
      toastError(App.errorMessage(error), 'No se pudo cambiar la versión');
    }
  }

  async function deleteDetailMod(file) {
    const display = file.replace(/\.disabled$/i, '');
    const confirmed = await App.confirmDialog({
      title: '¿Eliminar el mod?',
      message: `Se borrará «${display}» de esta instancia. Esta acción no se puede deshacer.`,
      confirm: 'Eliminar mod',
      icon: 'trash'
    });
    if (!confirmed) return;
    try {
      detailMods = await api.mods.remove(file);
      state.mods = detailMods;
      refreshDetailModsDom();
      App.home?.render?.();
      App.mods?.render?.();
      toast('Mod eliminado.', 'success');
    } catch (error) {
      toastError(App.errorMessage(error), 'No se pudo eliminar el mod');
    }
  }

  const CRASH_LABELS = { high: 'Crítico', medium: 'Aviso', low: 'Leve', none: 'Sin errores' };

  function crashReportText(result) {
    const lines = [`Instancia: ${result.instance}`, `Descripción: ${result.description || 'No disponible'}`];
    if (result.suspectedMods) lines.push(`Mods sospechosos: ${result.suspectedMods}`);
    lines.push('');
    if (!result.issues.length) lines.push('No se detectaron errores conocidos.');
    result.issues.forEach((issue, index) => {
      lines.push(`${index + 1}. [${CRASH_LABELS[issue.severity] || issue.severity}] ${issue.title}`);
      lines.push(`   ${issue.detail}`);
      lines.push(`   Solución: ${issue.suggestion}`);
      if (issue.line) lines.push(`   Línea: ${issue.line}`);
    });
    if (result.excerpt) {
      lines.push('', '--- Extracto del registro ---', result.excerpt);
    }
    return lines.join('\n');
  }

  function crashReportMarkup(result) {
    if (!result.sources.length) {
      return `
        <div class="empty-state compact">
          <span class="empty-icon">${icon('terminal')}</span>
          <h3>No hay registros todavía</h3>
          <p>Inicia el juego al menos una vez para generar <code>latest.log</code> y los informes de crash.</p>
        </div>`;
    }

    const severity = result.found ? result.severity : 'none';
    const summaryTitle = result.found
      ? `${result.issues.length} problema${result.issues.length === 1 ? '' : 's'} detectado${result.issues.length === 1 ? '' : 's'}`
      : 'No se han detectado errores conocidos';
    const summaryText = result.found
      ? 'Revisa las recomendaciones antes de volver a iniciar el juego.'
      : 'Si el juego sigue fallando, revisa el extracto del registro o comparte el diagnóstico.';

    const issues = result.issues.map((issue) => `
      <article class="crash-issue ${esc(issue.severity)}">
        <span class="crash-issue-icon">${icon(issue.severity === 'high' ? 'alert' : 'info')}</span>
        <div class="crash-issue-body">
          <div class="crash-issue-head">
            <strong>${esc(issue.title)}</strong>
            <span class="crash-tag ${esc(issue.severity)}">${esc(CRASH_LABELS[issue.severity] || issue.severity)}</span>
          </div>
          <p>${esc(issue.detail)}</p>
          <p class="crash-fix">${icon('check')}<span>${esc(issue.suggestion)}</span></p>
          ${issue.line ? `<code class="crash-line">${esc(issue.line)}</code>` : ''}
        </div>
      </article>`).join('');

    const context = [
      result.description ? `<div class="crash-context-row"><span>Descripción</span><strong>${esc(result.description)}</strong></div>` : '',
      result.suspectedMods ? `<div class="crash-context-row"><span>Mods sospechosos</span><strong>${esc(result.suspectedMods)}</strong></div>` : '',
      result.modSections.length ? `<div class="crash-context-row"><span>Secciones de mods</span><strong>${esc(result.modSections.join(', '))}</strong></div>` : ''
    ].filter(Boolean).join('');

    const sources = result.sources.map((source) => `
      <span class="crash-source" title="${esc(source.file)}">${icon(source.kind === 'crash-report' ? 'alert' : 'terminal')}${esc(source.file)}<small>${esc(App.formatBytes(source.size))} · ${esc(App.formatDate(source.modified))}</small></span>`).join('');

    return `
      <div class="crash-summary ${esc(severity)}">
        <span class="crash-summary-icon">${icon(result.found ? 'alert' : 'shield')}</span>
        <div><strong>${esc(summaryTitle)}</strong><p>${esc(summaryText)}</p></div>
      </div>
      ${context ? `<div class="crash-context">${context}</div>` : ''}
      ${issues ? `<div class="crash-issues">${issues}</div>` : ''}
      <div class="crash-sources">${sources}</div>
      ${result.excerpt ? `<details class="crash-details"><summary>Ver extracto del registro</summary><pre>${esc(result.excerpt)}</pre></details>` : ''}
      <div class="modal-actions">
        <button class="btn btn-ghost" data-crash-open>${icon('terminal')}Abrir latest.log</button>
        <button class="btn btn-secondary" data-crash-copy>${icon('copy')}Copiar informe</button>
        <button class="btn btn-primary" data-modal-close>${icon('check')}Entendido</button>
      </div>`;
  }

  function openCrashModal(instance) {
    const modal = App.openModal(`
      ${App.modalHead('DIAGNÓSTICO', 'Análisis de crashes', `Registros de ${instance.name}`)}
      <div id="crash-analysis" class="crash-analysis">
        <div class="detail-mods-state">${icon('refresh')}<span>Analizando registros…</span></div>
      </div>`, { wide: true });

    api.instances.analyzeLogs(instance.id).then((result) => {
      const host = $('#crash-analysis', modal);
      if (!host) return;
      host.innerHTML = crashReportMarkup(result);
      host.querySelector('[data-crash-open]')?.addEventListener('click', () => {
        api.instances.openLog(instance.id).catch((error) => toastError(App.errorMessage(error), 'No se pudo abrir el log'));
      });
      host.querySelector('[data-crash-copy]')?.addEventListener('click', async () => {
        if (await App.copyText(crashReportText(result))) toast('Informe copiado al portapapeles.', 'success');
      });
    }).catch((error) => {
      const host = $('#crash-analysis', modal);
      if (host) host.innerHTML = `<div class="detail-mods-state error">${icon('alert')}<span>${esc(App.errorMessage(error))}</span></div>`;
    });
  }

  function closeDetailMenu() {
    const menu = $('[data-detail-menu]');
    const button = $('[data-detail-more]');
    if (menu) menu.hidden = true;
    button?.setAttribute('aria-expanded', 'false');
  }

  async function runDetailAction(action, instance) {
    try {
      if (action === 'open') {
        await api.openFolder('instance');
      } else if (action === 'log') {
        await api.instances.openLog(instance.id);
      } else if (action === 'analyze') {
        openCrashModal(instance);
      } else if (action === 'add-file') {
        await addDetailMods();
      } else if (action === 'edit') {
        openInstanceModal(instance);
      } else if (action === 'meta') {
        openMetaModal(instance);
      } else if (action === 'verify') {
        openVerifyModal(instance);
      } else if (action === 'export') {
        openExportModal(instance);
      } else if (action === 'duplicate') {
        openDuplicateModal(instance);
      } else if (action === 'cover-remove') {
        await removeDetailCover(instance);
      } else if (action === 'delete') {
        if (state.instances.length <= 1) {
          toast('Debe quedar al menos una instancia.', 'warning');
          return;
        }
        openDeleteModal(instance);
      }
    } catch (error) {
      toastError(App.errorMessage(error), 'Error de instancia');
    }
  }

  function onDetailClick(event) {
    const instance = detailInstance();
    if (!instance) return;

    const externalLink = event.target.closest('a[data-external]');
    if (externalLink) {
      event.preventDefault();
      api.openExternal(externalLink.getAttribute('href'))
        .catch((error) => toastError(App.errorMessage(error), 'No se pudo abrir el enlace'));
      return;
    }

    const downloadButton = event.target.closest('[data-mod-download]');
    if (downloadButton) {
      installInstanceMod(downloadButton.dataset.modDownload, downloadButton);
      return;
    }

    const versionButton = event.target.closest('[data-mod-version-install]');
    if (versionButton) {
      installInstanceModVersion(
        versionButton.dataset.modVersionProject,
        versionButton.dataset.modVersionInstall,
        versionButton
      );
      return;
    }

    const modCard = event.target.closest('[data-mod-id]');
    if (modCard) {
      openInstanceMod(modCard.dataset.modId);
      return;
    }

    if (event.target.closest('[data-mod-browser-back]')) {
      detailView = 'detail';
      renderView();
      return;
    }
    if (event.target.closest('[data-mod-browser-refresh]')) {
      runInstanceModSearch(true);
      return;
    }
    if (event.target.closest('[data-mod-retry]')) {
      runInstanceModSearch(true);
      return;
    }
    if (event.target.closest('[data-mod-load-more]')) {
      runInstanceModSearch(false);
      return;
    }
    if (event.target.closest('[data-mod-edit-target]')) {
      openInstanceModal(instance);
      return;
    }
    if (event.target.closest('[data-mod-detail-back]')) {
      detailView = 'browse';
      renderModBrowser();
      refreshInstalledMods();
      return;
    }

    const modTab = event.target.closest('[data-mod-tab]');
    if (modTab) {
      selectedModTab = ['description', 'gallery', 'versions'].includes(modTab.dataset.modTab)
        ? modTab.dataset.modTab
        : 'description';
      renderModDetail();
      return;
    }

    const galleryImage = event.target.closest('[data-mod-gallery-index]');
    if (galleryImage) {
      openGalleryImage(Number(galleryImage.dataset.modGalleryIndex));
      return;
    }

    const openExternal = event.target.closest('[data-mod-open-external]');
    if (openExternal) {
      const slug = String(openExternal.dataset.modOpenExternal || '');
      if (slug) {
        api.openExternal(`https://modrinth.com/mod/${encodeURIComponent(slug)}`)
          .catch((error) => toastError(App.errorMessage(error), 'No se pudo abrir Modrinth'));
      }
      return;
    }

    const retryProject = event.target.closest('[data-mod-retry-project]');
    if (retryProject) {
      openInstanceMod(retryProject.dataset.modRetryProject);
      return;
    }

    const actionButton = event.target.closest('[data-detail-action]');
    if (actionButton) {
      closeDetailMenu();
      runDetailAction(actionButton.dataset.detailAction, instance);
      return;
    }

    if (event.target.closest('[data-detail-more]')) {
      const menu = $('[data-detail-menu]');
      const button = $('[data-detail-more]');
      if (!menu) return;
      const willOpen = menu.hidden;
      menu.hidden = !willOpen;
      button?.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      return;
    }

    if (event.target.closest('[data-detail-back]')) {
      closeDetail();
      return;
    }
    if (event.target.closest('[data-detail-cover-pick]')) {
      pickDetailCover(instance);
      return;
    }
    if (event.target.closest('[data-detail-settings]')) {
      openInstanceSettingsModal(instance);
      return;
    }
    if (event.target.closest('[data-detail-meta]')) {
      openMetaModal(instance);
      return;
    }
    if (event.target.closest('[data-detail-play]')) {
      App.home?.playInstance?.(instance);
      return;
    }
    if (event.target.closest('[data-detail-addmods]')) {
      openModBrowser();
      return;
    }
    if (event.target.closest('[data-detail-open-mods]')) {
      api.openFolder('mods').catch((error) => toastError(App.errorMessage(error), 'No se pudo abrir la carpeta'));
      return;
    }

    const deleteButton = event.target.closest('[data-detail-mod-delete]');
    if (deleteButton) deleteDetailMod(deleteButton.dataset.detailModDelete);
  }

  function onDetailSubmit(event) {
    const form = event.target.closest('[data-mod-search-form]');
    if (!form) return;
    event.preventDefault();
    modBrowseQuery = String($('#instance-mod-query')?.value || '').trim();
    runInstanceModSearch(true);
  }

  function onDetailKeydown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const card = event.target.closest('[data-mod-id]');
    if (!card || event.target.closest('button')) return;
    event.preventDefault();
    openInstanceMod(card.dataset.modId);
  }

  function onDetailChange(event) {
    const versionSelect = event.target.closest('[data-mod-version-select]');
    if (versionSelect) {
      selectDetailModVersion(versionSelect.dataset.modVersionSelect, versionSelect.value, versionSelect);
      return;
    }

    const toggle = event.target.closest('[data-detail-mod-toggle]');
    if (toggle) {
      toggleDetailMod(toggle.dataset.detailModToggle, toggle);
      return;
    }

    const compatible = event.target.closest('[data-mod-version-compatible]');
    if (compatible) {
      modVersionOnlyCompatible = compatible.checked;
      if (modVersionOnlyCompatible) renderModDetail();
      else loadAllModVersions();
      return;
    }

    const channel = event.target.closest('[data-mod-version-channel]');
    if (channel) {
      modVersionChannel = ['all', 'release', 'beta', 'alpha'].includes(channel.value) ? channel.value : 'all';
      renderModDetail();
    }
  }

  function openDuplicateModal(instance) {
    const modal = App.openModal(`
      ${App.modalHead('DUPLICAR', 'Copiar instancia', 'Se copian mods, ajustes y recursos. Las versiones se descargan de nuevo al jugar.')}
      <div class="modal-form">
        <label class="field-label" for="instance-copy-name">Nombre de la copia</label>
        <input class="text-input" id="instance-copy-name" type="text" maxlength="40" value="${esc(`${instance.name} copia`)}" autocomplete="off">
        <label class="check-row">
          <input type="checkbox" id="instance-copy-worlds" checked>
          <span>Copiar también los mundos guardados</span>
        </label>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-modal-close>Cancelar</button>
        <button class="btn btn-primary" data-instance-duplicate-save>${icon('copy')}Duplicar</button>
      </div>`);

    const submit = async () => {
      const name = String(modal.querySelector('#instance-copy-name')?.value || '').trim();
      if (!name) return;
      const button = modal.querySelector('[data-instance-duplicate-save]');
      App.setBusy(button, true, 'Copiando…');
      try {
        const data = await api.instances.duplicate({
          id: instance.id,
          name,
          copyWorlds: modal.querySelector('#instance-copy-worlds')?.checked !== false
        });
        App.applyInstanceState(data);
        App.closeModal();
        toast(`Copia «${name}» creada.`, 'success', 'Instancia duplicada');
      } catch (error) {
        toastError(App.errorMessage(error), 'No se pudo duplicar');
        App.setBusy(button, false);
      }
    };

    modal.querySelector('[data-instance-duplicate-save]')?.addEventListener('click', submit);
  }

  function openDeleteModal(instance) {
    const modal = App.openModal(`
      <div class="modal-icon danger">${icon('trash')}</div>
      ${App.modalHead('ELIMINAR', '¿Eliminar la instancia?', `Se quitará «${instance.name}» del launcher.`)}
      <p class="modal-text">Los archivos de la instancia se conservarán en el disco salvo que marques la casilla inferior.</p>
      <label class="check-row">
        <input type="checkbox" id="instance-delete-files">
        <span>Eliminar también todos los archivos (mods, mundos, versiones)</span>
      </label>
      <p class="form-hint">Solo se pueden borrar desde aquí las carpetas creadas por el launcher.</p>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-modal-close>Cancelar</button>
        <button class="btn btn-danger" data-instance-delete-confirm>Eliminar instancia</button>
      </div>`);

    const submit = async () => {
      const button = modal.querySelector('[data-instance-delete-confirm]');
      App.setBusy(button, true, 'Eliminando…');
      try {
        const data = await api.instances.remove({
          id: instance.id,
          deleteFiles: modal.querySelector('#instance-delete-files')?.checked === true
        });
        App.applyInstanceState(data);
        App.closeModal();
        toast('Instancia eliminada.', 'success');
      } catch (error) {
        toastError(App.errorMessage(error), 'No se pudo eliminar');
        App.setBusy(button, false);
      }
    };

    modal.querySelector('[data-instance-delete-confirm]')?.addEventListener('click', submit);
  }

  function progressBlock(id) {
    return `
      <div class="instance-progress" id="${id}" hidden>
        <div class="instance-progress-head">
          <span data-progress-text>Preparando…</span>
          <span data-progress-percent></span>
        </div>
        <div class="progress"><div class="progress-bar" data-progress-bar></div></div>
      </div>`;
  }

  function setProgress(modal, message, percent) {
    const block = modal?.querySelector('.instance-progress');
    if (!block) return;
    block.hidden = false;
    const text = block.querySelector('[data-progress-text]');
    const value = block.querySelector('[data-progress-percent]');
    const bar = block.querySelector('[data-progress-bar]');
    if (text && typeof message === 'string') text.textContent = message;
    const hasPercent = typeof percent === 'number' && Number.isFinite(percent);
    if (value) value.textContent = hasPercent ? `${Math.round(percent)} %` : '';
    if (bar) bar.style.width = `${hasPercent ? Math.max(0, Math.min(100, percent)) : 0}%`;
  }

  function handleProgress(event) {
    const overlay = $('#modal-overlay');
    const modal = $('#modal');
    if (!event || !modal || !overlay || overlay.hidden) return;
    if (!modal.querySelector('.instance-progress')) return;
    setProgress(modal, event.message, event.percent);
  }

  async function refreshInstances() {
    try {
      const data = await api.instances.list();
      App.applyInstanceState(data);
    } catch {
      /* la lista se actualizará en el próximo inicio */
    }
  }

  function rangeRow(id, label, min, max, value) {
    return `
      <div class="range-row">
        <span>${esc(label)}</span>
        <input id="${id}" type="range" min="${min}" max="${max}" step="1" value="${value}">
        <output id="${id}-out">${value} GB</output>
      </div>`;
  }

  function toggleBody(checkbox, body) {
    if (!checkbox || !body) return;
    const inherit = checkbox.checked;
    body.classList.toggle('is-inherited', inherit);
    body.querySelectorAll('input, select, button').forEach((element) => {
      if (element === checkbox) return;
      element.disabled = inherit;
    });
  }

  function openInstanceSettingsModal(instance) {
    const globalSettings = state.settings || {};
    const own = instance.settings && typeof instance.settings === 'object' ? instance.settings : {};
    const memory = own.memory || globalSettings.memory || { min: 2, max: 4 };
    const resolution = own.resolution || globalSettings.resolution || { width: 1280, height: 720, fullscreen: false };
    const hasMemory = Boolean(own.memory);
    const hasResolution = Boolean(own.resolution);
    const hasJvm = typeof own.jvmArgs === 'string';
    const hasGame = typeof own.gameArgs === 'string';
    const hasJava = typeof own.javaPath === 'string';
    const hasMinimize = typeof own.minimizeOnLaunch === 'boolean';
    const maxMemory = Math.max(4, Math.min(64, Math.floor(Number(state.system?.totalMemory) || 16)));

    const javaList = Array.isArray(state.java) ? state.java : [];
    const javaOptions = [
      '<option value="__inherit__">Heredar del launcher</option>',
      '<option value="">Automático (mejor Java disponible)</option>'
    ];
    if (javaList.length) {
      javaOptions.push(`<optgroup label="Java detectado">${javaList.map((item) => (
        `<option value="${esc(item.path)}">Java ${esc(item.version)}${item.vendor ? ` · ${esc(item.vendor)}` : ''}${item.major ? ` (${item.major})` : ''}</option>`
      )).join('')}</optgroup>`);
    }
    if (hasJava && own.javaPath && !javaList.some((item) => item.path === own.javaPath)) {
      javaOptions.push(`<option value="${esc(own.javaPath)}">${esc(own.javaPath)}</option>`);
    }

    const modal = App.openModal(`
      ${App.modalHead(
        'AJUSTES DE INSTANCIA',
        instance.name,
        'Marca «Heredar» para usar el ajuste global del launcher. Los cambios se aplican al lanzar esta instancia.'
      )}
      <div class="modal-form instance-settings-form">
        <section class="instance-setting-card">
          <div class="instance-setting-head">
            <div><strong>Memoria RAM</strong><small>Rango mínimo y máximo para esta instancia</small></div>
            <label class="instance-inherit"><input type="checkbox" id="inst-inherit-memory"${hasMemory ? '' : ' checked'}>Heredar</label>
          </div>
          <div class="instance-setting-body" id="inst-memory-body">
            ${rangeRow('inst-min-mem', 'Mínimo', 1, maxMemory, memory.min)}
            ${rangeRow('inst-max-mem', 'Máximo', 1, maxMemory, memory.max)}
            <p class="help-text">Global: ${globalSettings.memory?.min ?? 2}–${globalSettings.memory?.max ?? 4} GB</p>
          </div>
        </section>

        <section class="instance-setting-card">
          <div class="instance-setting-head">
            <div><strong>Resolución</strong><small>Tamaño de la ventana de Minecraft</small></div>
            <label class="instance-inherit"><input type="checkbox" id="inst-inherit-resolution"${hasResolution ? '' : ' checked'}>Heredar</label>
          </div>
          <div class="instance-setting-body" id="inst-resolution-body">
            <div class="resolution-row">
              <div class="field-mini"><label for="inst-width">Ancho</label><input id="inst-width" type="number" min="640" max="7680" step="1" value="${resolution.width}"></div>
              <span class="resolution-x">×</span>
              <div class="field-mini"><label for="inst-height">Alto</label><input id="inst-height" type="number" min="480" max="4320" step="1" value="${resolution.height}"></div>
            </div>
            <label class="check-row"><input type="checkbox" id="inst-fullscreen"${resolution.fullscreen ? ' checked' : ''}><span>Iniciar en pantalla completa</span></label>
          </div>
        </section>

        <section class="instance-setting-card">
          <div class="instance-setting-head">
            <div><strong>Java</strong><small>Ejecutable propio para esta instancia</small></div>
          </div>
          <div class="instance-setting-body" id="inst-java-body">
            <div class="row-gap">
              <div class="select-wrap grow">
                <select id="inst-java" class="select">${javaOptions.join('')}</select>
                <svg class="icon select-caret"><use href="#i-chevron-down"></use></svg>
              </div>
              <button class="btn btn-ghost" id="inst-java-browse">Examinar</button>
            </div>
            <p class="form-hint" id="inst-java-hint">Si el Java elegido no es compatible, Minecraft no arrancará. En automático se elige el mejor disponible.</p>
          </div>
        </section>

        <section class="instance-setting-card">
          <div class="instance-setting-head">
            <div><strong>Argumentos JVM</strong><small>Opcionales, se añaden al iniciar</small></div>
            <label class="instance-inherit"><input type="checkbox" id="inst-inherit-jvm"${hasJvm ? '' : ' checked'}>Heredar</label>
          </div>
          <div class="instance-setting-body" id="inst-jvm-body">
            <input id="inst-jvm-args" class="text-input mono" type="text" maxlength="4000" value="${esc(hasJvm ? own.jvmArgs : (globalSettings.jvmArgs || ''))}" placeholder="${esc(globalSettings.jvmArgs || '-XX:+UseG1GC')}" autocomplete="off" spellcheck="false">
          </div>
        </section>

        <section class="instance-setting-card">
          <div class="instance-setting-head">
            <div><strong>Argumentos del juego</strong><small>Parámetros extra para Minecraft</small></div>
            <label class="instance-inherit"><input type="checkbox" id="inst-inherit-game"${hasGame ? '' : ' checked'}>Heredar</label>
          </div>
          <div class="instance-setting-body" id="inst-game-body">
            <input id="inst-game-args" class="text-input mono" type="text" maxlength="4000" value="${esc(hasGame ? own.gameArgs : (globalSettings.gameArgs || ''))}" placeholder="${esc(globalSettings.gameArgs || '--server ejemplo.net')}" autocomplete="off" spellcheck="false">
          </div>
        </section>

        <section class="instance-setting-card">
          <div class="instance-setting-head">
            <div><strong>Minimizar al lanzar</strong><small>Libera la pantalla cuando arranca el juego</small></div>
          </div>
          <div class="instance-setting-body" id="inst-minimize-body">
            <div class="select-wrap">
              <select id="inst-minimize" class="select">
                <option value="inherit">Heredar del launcher</option>
                <option value="yes">Sí, minimizar</option>
                <option value="no">No minimizar</option>
              </select>
              <svg class="icon select-caret"><use href="#i-chevron-down"></use></svg>
            </div>
          </div>
        </section>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-instance-settings-reset>Restablecer herencia</button>
        <button class="btn btn-ghost" data-modal-close>Cancelar</button>
        <button class="btn btn-primary" data-instance-settings-save>${icon('check')}Guardar ajustes</button>
      </div>`, { wide: true });

    const memoryToggle = modal.querySelector('#inst-inherit-memory');
    const resolutionToggle = modal.querySelector('#inst-inherit-resolution');
    const jvmToggle = modal.querySelector('#inst-inherit-jvm');
    const gameToggle = modal.querySelector('#inst-inherit-game');
    const javaSelect = modal.querySelector('#inst-java');
    const minimizeSelect = modal.querySelector('#inst-minimize');

    javaSelect.value = hasJava ? own.javaPath : '__inherit__';
    minimizeSelect.value = hasMinimize ? (own.minimizeOnLaunch ? 'yes' : 'no') : 'inherit';

    const bodies = [
      [memoryToggle, modal.querySelector('#inst-memory-body')],
      [resolutionToggle, modal.querySelector('#inst-resolution-body')],
      [jvmToggle, modal.querySelector('#inst-jvm-body')],
      [gameToggle, modal.querySelector('#inst-game-body')]
    ];
    for (const [toggle, body] of bodies) {
      toggleBody(toggle, body);
      toggle?.addEventListener('change', () => toggleBody(toggle, body));
    }

    const bindRange = (id) => {
      const input = modal.querySelector(`#${id}`);
      const output = modal.querySelector(`#${id}-out`);
      input?.addEventListener('input', () => {
        if (output) output.textContent = `${input.value} GB`;
      });
    };
    bindRange('inst-min-mem');
    bindRange('inst-max-mem');

    modal.querySelector('#inst-java-browse')?.addEventListener('click', async () => {
      try {
        const result = await api.instances.pickJava();
        if (!result || result.canceled) return;
        if (result.error) {
          toast(result.error, 'warning');
          return;
        }
        const path = result.java?.path;
        if (!path) return;
        if (![...javaSelect.options].some((option) => option.value === path)) {
          const option = document.createElement('option');
          option.value = path;
          option.textContent = `Java ${result.java.version}${result.java.vendor ? ` · ${result.java.vendor}` : ''} (${path})`;
          javaSelect.appendChild(option);
        }
        javaSelect.value = path;
      } catch (error) {
        toastError(App.errorMessage(error), 'No se pudo elegir Java');
      }
    });

    modal.querySelector('[data-instance-settings-reset]')?.addEventListener('click', () => {
      for (const [toggle, body] of bodies) {
        if (!toggle) continue;
        toggle.checked = true;
        toggleBody(toggle, body);
      }
      javaSelect.value = '__inherit__';
      minimizeSelect.value = 'inherit';
    });

    const save = async () => {
      const minValue = Number(modal.querySelector('#inst-min-mem')?.value) || 1;
      const maxValue = Number(modal.querySelector('#inst-max-mem')?.value) || minValue;
      const width = Number(modal.querySelector('#inst-width')?.value) || 1280;
      const height = Number(modal.querySelector('#inst-height')?.value) || 720;

      const settings = {
        memory: memoryToggle?.checked
          ? null
          : { min: Math.max(1, Math.min(minValue, maxValue)), max: Math.max(minValue, maxValue) },
        resolution: resolutionToggle?.checked
          ? null
          : {
            width: Math.min(7680, Math.max(640, Math.round(width))),
            height: Math.min(4320, Math.max(480, Math.round(height))),
            fullscreen: modal.querySelector('#inst-fullscreen')?.checked === true
          },
        jvmArgs: jvmToggle?.checked ? null : String(modal.querySelector('#inst-jvm-args')?.value || ''),
        gameArgs: gameToggle?.checked ? null : String(modal.querySelector('#inst-game-args')?.value || ''),
        javaPath: javaSelect.value === '__inherit__' ? null : javaSelect.value,
        minimizeOnLaunch: minimizeSelect.value === 'inherit' ? null : minimizeSelect.value === 'yes'
      };

      const button = modal.querySelector('[data-instance-settings-save]');
      App.setBusy(button, true, 'Guardando…');
      try {
        const data = await api.instances.update({ id: instance.id, settings });
        App.applyInstanceState(data);
        App.closeModal();
        toast('Ajustes de la instancia guardados.', 'success', 'Instancia actualizada');
      } catch (error) {
        toastError(App.errorMessage(error), 'No se pudieron guardar los ajustes');
        App.setBusy(button, false);
      }
    };

    modal.querySelector('[data-instance-settings-save]')?.addEventListener('click', save);
  }

  function verifyRow(ok, label, detail, neutral = false) {
    const stateClass = neutral ? 'neutral' : (ok ? 'ok' : 'bad');
    const iconName = neutral ? 'info' : (ok ? 'check' : 'alert');
    return `
      <div class="verify-row ${stateClass}">
        <span class="verify-icon">${icon(iconName)}</span>
        <div><strong>${esc(label)}</strong>${detail ? `<small>${esc(detail)}</small>` : ''}</div>
      </div>`;
  }

  function renderVerifyResult(result) {
    const summary = result?.summary || {};
    const version = summary.version || {};
    const loader = summary.loader || {};
    const libraries = summary.libraries || {};
    const assets = summary.assets || {};
    const issues = Array.isArray(result?.issues) ? result.issues : [];
    const loaderName = loader.id && loader.id !== 'vanilla' ? App.loaderLabel(loader.id) : 'Vanilla';

    const rows = [];
    rows.push(verifyRow(
      version.json && version.jar,
      `Minecraft ${version.id || '—'}`,
      version.json && version.jar
        ? 'Perfil y cliente presentes.'
        : `Perfil: ${version.json ? 'sí' : 'no'} · Cliente: ${version.jar ? 'sí' : 'no'}`
    ));
    rows.push(verifyRow(
      loader.id === 'vanilla' || loader.installed,
      loaderName === 'Vanilla' ? 'Vanilla' : `${loaderName} ${loader.expected || ''}`.trim(),
      loader.id === 'vanilla'
        ? 'Sin cargador de mods.'
        : (loader.installed ? 'Cargador instalado.' : 'Falta el cargador o su perfil.')
    ));
    rows.push(verifyRow(
      !libraries.missing,
      'Librerías',
      `${(libraries.total || 0) - (libraries.missing || 0)}/${libraries.total || 0} presentes`
    ));
    rows.push(verifyRow(
      assets.index && !assets.missing,
      'Recursos del juego',
      assets.index
        ? `${(assets.total || 0) - (assets.missing || 0)}/${assets.total || 0} presentes`
        : 'Falta el índice de recursos',
      !assets.index && !assets.total
    ));

    const issueList = issues.length
      ? `<div class="verify-issues">${issues.map((issue) => `
          <div class="verify-issue ${issue.severity === 'error' ? 'bad' : ''}">
            ${icon(issue.severity === 'error' ? 'alert' : 'info')}
            <span>${esc(issue.message)}</span>
          </div>`).join('')}</div>`
      : '<p class="verify-ok">Todo en orden. La instancia está lista para jugar.</p>';

    return `
      <div class="verify-list">${rows.join('')}</div>
      ${issueList}`;
  }

  function openVerifyModal(instance) {
    const modal = App.openModal(`
      ${App.modalHead(
        'VERIFICAR',
        instance.name,
        'Comprueba la versión base, el cargador, las librerías y los recursos del juego.'
      )}
      <div class="modal-form">
        <div id="verify-body">
          <p class="modal-text">Analizando los archivos de la instancia…</p>
        </div>
        ${progressBlock('instance-verify-progress')}
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-modal-close>Cerrar</button>
        <button class="btn btn-primary" data-instance-repair>${icon('refresh')}Reparar</button>
      </div>`, { wide: true });

    const body = modal.querySelector('#verify-body');
    const repairButton = modal.querySelector('[data-instance-repair]');
    let current = null;

    const runVerify = async () => {
      try {
        current = await api.instances.verify({ id: instance.id });
        if (body) body.innerHTML = renderVerifyResult(current);
        const hasErrors = Array.isArray(current.issues) && current.issues.length > 0;
        if (repairButton) repairButton.disabled = !hasErrors;
      } catch (error) {
        if (body) body.innerHTML = `<p class="modal-text">${esc(App.errorMessage(error))}</p>`;
        if (repairButton) repairButton.disabled = true;
      }
    };

    repairButton?.addEventListener('click', async () => {
      App.setBusy(repairButton, true, 'Reparando…');
      setProgress(modal, 'Preparando la reparación…', 2);
      try {
        const result = await api.instances.repair({ id: instance.id });
        current = result;
        if (body) body.innerHTML = renderVerifyResult(result);
        setProgress(modal, 'Archivos reparados.', 100);
        if (result.settings || result.instances) App.applyInstanceState(result);
        else await refreshInstances();
        toast('Reparación completada.', 'success', 'Archivos verificados');
        if (Array.isArray(result.issues) && result.issues.length) {
          toast('Quedan incidencias pendientes. Revisa la lista de la ventana.', 'warning', 'Revisión necesaria');
        }
      } catch (error) {
        setProgress(modal, App.errorMessage(error), null);
        toastError(App.errorMessage(error), 'No se pudo reparar');
      } finally {
        App.setBusy(repairButton, false);
        if (repairButton && current) {
          repairButton.disabled = !(Array.isArray(current.issues) && current.issues.length);
        }
      }
    });

    runVerify();
  }

  function openExportModal(instance) {
    const modal = App.openModal(`
      ${App.modalHead(
        'EXPORTAR',
        `Exportar «${instance.name}»`,
        'Genera un modpack con los mods, configuraciones y recursos de esta instancia.'
      )}
      <div class="modal-form">
        <div class="launch-field">
          <label class="launch-label" for="export-format">FORMATO</label>
          <div class="select-wrap">
            <select id="export-format" class="select">
              <option value="mrpack">.mrpack · compatible con Modrinth y otros launchers</option>
              <option value="zip">.zip · copia de NexyLauncher</option>
            </select>
            <svg class="icon select-caret"><use href="#i-chevron-down"></use></svg>
          </div>
        </div>
        <label class="check-row">
          <input type="checkbox" id="export-worlds">
          <span>Incluir también los mundos guardados</span>
        </label>
        <p class="form-hint">Se incluyen mods, configuraciones, resourcepacks, shaderpacks, scripts y opciones. El formato .mrpack coloca el contenido en <code>overrides/</code>.</p>
        <div id="export-result" hidden></div>
        ${progressBlock('instance-export-progress')}
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-modal-close>Cerrar</button>
        <button class="btn btn-primary" data-instance-export-run>${icon('archive')}Exportar modpack</button>
      </div>`, { wide: true });

    const button = modal.querySelector('[data-instance-export-run]');
    button?.addEventListener('click', async () => {
      const format = modal.querySelector('#export-format')?.value === 'zip' ? 'zip' : 'mrpack';
      const includeWorlds = modal.querySelector('#export-worlds')?.checked === true;
      App.setBusy(button, true, 'Exportando…');
      setProgress(modal, 'Preparando el modpack…', 10);
      try {
        const result = await api.instances.export({ id: instance.id, format, includeWorlds });
        if (!result || result.canceled) {
          setProgress(modal, '', null);
          const block = modal.querySelector('.instance-progress');
          if (block) block.hidden = true;
          App.setBusy(button, false);
          return;
        }
        setProgress(modal, 'Modpack exportado.', 100);
        const box = modal.querySelector('#export-result');
        if (box) {
          box.hidden = false;
          box.innerHTML = `
            <div class="export-result">
              <strong>${esc(result.files || 0)} archivo(s) · ${esc(App.formatBytes ? App.formatBytes(result.size || 0) : `${result.size || 0} B`)}</strong>
              <small title="${esc(result.path)}">${esc(result.path)}</small>
              <button class="link-btn" data-export-copy>Copiar ruta</button>
            </div>`;
          box.querySelector('[data-export-copy]')?.addEventListener('click', () => App.copyText(result.path));
        }
        toast('Modpack exportado correctamente.', 'success', 'Exportación completada');
      } catch (error) {
        setProgress(modal, App.errorMessage(error), null);
        toastError(App.errorMessage(error), 'No se pudo exportar');
      } finally {
        App.setBusy(button, false);
      }
    });
  }

  async function importInstance() {
    const modal = App.openModal(`
      ${App.modalHead(
        'IMPORTAR',
        'Importar modpack o instancia',
        'Se admiten .mrpack de Modrinth, ZIP de CurseForge y exportaciones de NexyLauncher.'
      )}
      <div class="modal-form">
        <p class="modal-text" id="import-status">Esperando a que elijas un archivo…</p>
        ${progressBlock('instance-import-progress')}
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-modal-close>Cerrar</button>
      </div>`);

    try {
      const data = await api.instances.import({});
      if (!data || data.canceled) {
        App.closeModal();
        return;
      }
      closeDetail();
      App.applyInstanceState(data);
      App.closeModal();
      App.go('instances');
      const name = data.instance?.name || 'Instancia';
      toast(`«${name}» importada con ${data.installed || 0} archivo(s).`, 'success', 'Modpack importado');
      if (Array.isArray(data.warnings) && data.warnings.length) {
        toast(
          `${data.warnings.length} archivo(s) no se pudieron descargar. Usa Verificar y Reparar en la instancia.`,
          'warning',
          'Importación parcial'
        );
      }
    } catch (error) {
      const status = modal.querySelector('#import-status');
      if (status) status.textContent = App.errorMessage(error);
      const block = modal.querySelector('.instance-progress');
      if (block) block.hidden = true;
      toastError(App.errorMessage(error), 'No se pudo importar');
    }
  }

  async function onGridClick(event) {
    const card = event.target.closest('[data-instance-id]');
    if (!card) return;
    const instance = state.instances.find((item) => item.id === card.dataset.instanceId);
    if (!instance) return;

    const action = event.target.closest('button');
    if (!action) {
      openDetail(instance.id);
      return;
    }

    try {
      if (action.matches('[data-instance-play]')) {
        await App.home?.playInstance?.(instance);
      }
    } catch (error) {
      toastError(App.errorMessage(error), 'Error de instancia');
    }
  }

  function onGridKeydown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const card = event.target.closest('[data-instance-id]');
    if (!card || event.target.closest('button')) return;
    event.preventDefault();
    openDetail(card.dataset.instanceId);
  }

  function init() {
    $('#btn-new-instance')?.addEventListener('click', () => openInstanceModal());
    $('#btn-new-instance-empty')?.addEventListener('click', () => openInstanceModal());
    $('#btn-open-instances')?.addEventListener('click', async () => {
      try {
        await api.openFolder('instances');
      } catch (error) {
        toastError(App.errorMessage(error), 'No se pudo abrir la carpeta');
      }
    });

    $('#btn-import-instance')?.addEventListener('click', importInstance);
    api.onInstancesProgress?.(handleProgress);

    $('#instances-grid')?.addEventListener('click', onGridClick);
    $('#instances-grid')?.addEventListener('keydown', onGridKeydown);
    $('#instance-detail')?.addEventListener('click', onDetailClick);
    $('#instance-detail')?.addEventListener('change', onDetailChange);
    $('#instance-detail')?.addEventListener('submit', onDetailSubmit);
    $('#instance-detail')?.addEventListener('keydown', onDetailKeydown);
    document.addEventListener('click', (event) => {
      if (!event.target.closest('.detail-menu-wrap')) closeDetailMenu();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeDetailMenu();
    });
  }

  App.instances = { init, render, select: selectInstance, create: () => openInstanceModal(), edit: (instance) => openInstanceModal(instance), open: openDetail, close: closeDetail };
})();
