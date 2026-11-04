'use strict';

/* NexyLauncher 1.0 — mundos, resource packs, shaders y capturas. */
(() => {
  const App = window.NexyApp;
  const api = App.api;
  const { $, $$, esc, icon, state, toast, toastError } = App;

  const TABS = {
    worlds: { label: 'Mundos', icon: 'archive' },
    resourcepacks: { label: 'Resource packs', icon: 'image' },
    shaderpacks: { label: 'Shaders', icon: 'sparkles' },
    screenshots: { label: 'Capturas', icon: 'image' }
  };

  let tab = 'worlds';
  let items = [];
  let backups = [];
  let loading = false;
  let error = '';
  let request = 0;

  function activeInstance() {
    return App.activeInstanceEntry?.() || null;
  }

  function setActions(markup) {
    const host = $('#content-actions');
    if (host) host.innerHTML = markup;
  }

  function renderActions() {
    if (tab === 'worlds') {
      setActions(`
        <button class="btn btn-ghost" data-content-open="saves">${icon('folder')}Abrir mundos</button>
        <button class="btn btn-ghost" data-content-refresh>${icon('refresh')}Actualizar</button>`);
      return;
    }
    if (tab === 'screenshots') {
      setActions(`
        <button class="btn btn-ghost" data-content-open="screenshots">${icon('folder')}Abrir capturas</button>
        <button class="btn btn-ghost" data-content-refresh>${icon('refresh')}Actualizar</button>`);
      return;
    }
    setActions(`
      <button class="btn btn-primary" data-content-add>${icon('plus')}Añadir ${TABS[tab].label.toLowerCase()}</button>
      <button class="btn btn-ghost" data-content-open="${tab === 'resourcepacks' ? 'resourcePacks' : 'shaderPacks'}">${icon('folder')}Abrir carpeta</button>
      <button class="btn btn-ghost" data-content-refresh>${icon('refresh')}Actualizar</button>`);
  }

  function emptyMarkup() {
    const messages = {
      worlds: ['Todavía no hay mundos', 'Crea un mundo en Minecraft y aparecerá aquí.'],
      resourcepacks: ['Sin resource packs', 'Añade archivos .zip para cambiar texturas y modelos.'],
      shaderpacks: ['Sin shaders', 'Añade archivos .zip compatibles con Iris u OptiFine.'],
      screenshots: ['Sin capturas', 'Pulsa F2 en Minecraft y aparecerán en esta galería.']
    };
    const [title, text] = messages[tab] || ['Sin contenido', 'No hay archivos en esta sección.'];
    return `
      <div class="empty-state">
        <span class="empty-icon">${icon(TABS[tab]?.icon || 'archive')}</span>
        <h3>${esc(title)}</h3>
        <p>${esc(text)}</p>
      </div>`;
  }

  function worldCard(world) {
    return `
      <article class="content-card world-card">
        <span class="content-icon">${icon('archive')}</span>
        <div class="mod-main">
          <strong title="${esc(world.name)}">${esc(world.name)}</strong>
          <small>${esc(App.formatBytes(world.size))} · ${esc(App.relativeDate(world.modified))}</small>
        </div>
        <div class="content-actions">
          <button class="action-btn" data-world-backup="${esc(world.name)}" title="Crear copia de seguridad">${icon('download')}</button>
          <button class="action-btn" data-world-duplicate="${esc(world.name)}" title="Duplicar mundo">${icon('copy')}</button>
          <button class="action-btn" data-world-open="${esc(world.name)}" title="Abrir carpeta">${icon('folder')}</button>
          <button class="action-btn danger" data-world-delete="${esc(world.name)}" title="Eliminar mundo">${icon('trash')}</button>
        </div>
      </article>`;
  }

  function backupCard(backup) {
    return `
      <article class="content-card backup-card">
        <span class="content-icon">${icon('shield')}</span>
        <div class="mod-main">
          <strong title="${esc(backup.file)}">${esc(backup.file)}</strong>
          <small>${esc(App.formatBytes(backup.size))} · ${esc(App.formatDate(backup.modified))}</small>
        </div>
        <div class="content-actions">
          <button class="btn btn-ghost btn-sm" data-world-restore="${esc(backup.file)}">${icon('refresh')}Restaurar</button>
          <button class="action-btn danger" data-world-delete-backup="${esc(backup.file)}" title="Eliminar copia">${icon('trash')}</button>
        </div>
      </article>`;
  }

  function renderWorlds() {
    const list = items.length
      ? `<div class="content-list">${items.map(worldCard).join('')}</div>`
      : emptyMarkup();
    const backupList = backups.length
      ? `<div class="content-subhead"><div><h3>Copias de seguridad</h3><p>Se guardan en <code>.nexy/backups/worlds</code></p></div></div>
         <div class="content-list">${backups.map(backupCard).join('')}</div>`
      : '';
    return `${list}${backupList}`;
  }

  function packCard(file) {
    const display = file.file.replace(/\.disabled$/i, '');
    return `
      <article class="content-card ${file.enabled ? '' : 'off'}">
        <span class="content-icon">${icon(tab === 'shaderpacks' ? 'sparkles' : 'image')}</span>
        <div class="mod-main">
          <strong title="${esc(display)}">${esc(display)}</strong>
          <small>${esc(App.formatBytes(file.size))} · ${file.enabled ? 'Activo' : 'Desactivado'} · ${esc(App.formatDate(file.modified))}</small>
        </div>
        <div class="content-actions">
          <label class="switch" title="${file.enabled ? 'Desactivar' : 'Activar'}">
            <input type="checkbox" data-content-toggle="${esc(file.file)}" ${file.enabled ? 'checked' : ''}>
            <span class="switch-track"></span>
          </label>
          <button class="action-btn danger" data-content-delete="${esc(file.file)}" title="Eliminar">${icon('trash')}</button>
        </div>
      </article>`;
  }

  function renderPacks() {
    return items.length
      ? `<div class="content-list">${items.map(packCard).join('')}</div>`
      : emptyMarkup();
  }

  function screenshotCard(shot) {
    return `
      <figure class="screenshot-card">
        <button class="screenshot-thumb" data-screenshot-open="${esc(shot.file)}" title="Ver ${esc(shot.file)}">
          ${shot.thumb
            ? `<img src="${esc(shot.thumb)}" alt="${esc(shot.file)}" loading="lazy">`
            : `<span class="screenshot-placeholder">${icon('image')}</span>`}
        </button>
        <figcaption>
          <span title="${esc(shot.file)}">${esc(shot.file)}</span>
          <small>${esc(App.formatBytes(shot.size))} · ${esc(App.formatDate(shot.modified))}</small>
        </figcaption>
        <div class="screenshot-actions">
          <button class="action-btn" data-screenshot-open-file="${esc(shot.file)}" title="Abrir imagen">${icon('external')}</button>
          <button class="action-btn danger" data-screenshot-delete="${esc(shot.file)}" title="Eliminar captura">${icon('trash')}</button>
        </div>
      </figure>`;
  }

  function renderScreenshots() {
    return items.length
      ? `<div class="screenshot-grid">${items.map(screenshotCard).join('')}</div>`
      : emptyMarkup();
  }

  function render() {
    $$('#content-tabs [data-ctab]').forEach((button) => {
      button.classList.toggle('active', button.dataset.ctab === tab);
    });
    renderActions();
    const host = $('#content-list');
    if (!host) return;
    if (loading) {
      host.innerHTML = `<div class="detail-mods-state">${icon('refresh')}<span>Leyendo contenido…</span></div>`;
      return;
    }
    if (error) {
      host.innerHTML = `<div class="detail-mods-state error">${icon('alert')}<span>${esc(error)}</span></div>`;
      return;
    }
    if (tab === 'worlds') host.innerHTML = renderWorlds();
    else if (tab === 'screenshots') host.innerHTML = renderScreenshots();
    else host.innerHTML = renderPacks();
  }

  async function refresh(force = false) {
    const instance = activeInstance();
    if (!instance) return;
    const token = ++request;
    loading = true;
    error = '';
    render();
    try {
      if (tab === 'worlds') {
        const [worlds, backupFiles] = await Promise.all([api.worlds.list(), api.worlds.backups()]);
        if (token !== request) return;
        items = Array.isArray(worlds) ? worlds : [];
        backups = Array.isArray(backupFiles) ? backupFiles : [];
      } else if (tab === 'screenshots') {
        const shots = await api.screenshots.list();
        if (token !== request) return;
        items = Array.isArray(shots) ? shots : [];
        backups = [];
      } else {
        const files = await api.content.list(tab);
        if (token !== request) return;
        items = Array.isArray(files) ? files : [];
        backups = [];
      }
    } catch (err) {
      if (token !== request) return;
      error = App.errorMessage(err);
      items = [];
      backups = [];
    } finally {
      if (token === request) {
        loading = false;
        render();
      }
    }
  }

  function setTab(next) {
    if (!TABS[next] || next === tab) return;
    tab = next;
    items = [];
    backups = [];
    refresh(true);
  }

  async function openFolder(key) {
    try {
      await api.openFolder(key);
    } catch (err) {
      toastError(App.errorMessage(err), 'No se pudo abrir la carpeta');
    }
  }

  async function addPacks() {
    try {
      const result = await api.content.pick(tab);
      if (!result || result.canceled) return;
      const added = result.added?.length || 0;
      const skipped = result.skipped?.length || 0;
      if (added) toast(`${added} archivo${added === 1 ? '' : 's'} añadido${added === 1 ? '' : 's'}.`, 'success', 'Contenido añadido');
      else if (skipped) toast('Los archivos no son .zip válidos o superan el tamaño máximo.', 'warning', 'Nada añadido');
      await refresh(true);
    } catch (err) {
      toastError(App.errorMessage(err), 'No se pudieron añadir archivos');
    }
  }

  async function togglePack(file, input) {
    if (input) input.disabled = true;
    try {
      items = await api.content.toggle({ kind: tab, file });
      render();
    } catch (err) {
      if (input) {
        input.checked = !input.checked;
        input.disabled = false;
      }
      toastError(App.errorMessage(err), 'No se pudo cambiar el archivo');
    }
  }

  async function deletePack(file) {
    const confirmed = await App.confirmDialog({
      title: '¿Eliminar el archivo?',
      message: `Se borrará «${file.replace(/\.disabled$/i, '')}». Esta acción no se puede deshacer.`,
      confirm: 'Eliminar',
      icon: 'trash'
    });
    if (!confirmed) return;
    try {
      items = await api.content.remove({ kind: tab, file });
      render();
      toast('Archivo eliminado.', 'success');
    } catch (err) {
      toastError(App.errorMessage(err), 'No se pudo eliminar');
    }
  }

  async function backup(name) {
    try {
      const result = await api.worlds.backup(name);
      backups = await api.worlds.backups();
      render();
      toast(`Copia creada: ${result.file}`, 'success', 'Mundo protegido');
    } catch (err) {
      toastError(App.errorMessage(err), 'No se pudo crear la copia');
    }
  }

  async function restore(file) {
    const confirmed = await App.confirmDialog({
      title: '¿Restaurar la copia?',
      message: `Se extraerá «${file}» como un mundo nuevo. El mundo original no se toca.`,
      confirm: 'Restaurar',
      icon: 'refresh'
    });
    if (!confirmed) return;
    try {
      const result = await api.worlds.restore(file);
      await refresh(true);
      toast(`Restaurado como «${result.name}».`, 'success', 'Mundo restaurado');
    } catch (err) {
      toastError(App.errorMessage(err), 'No se pudo restaurar');
    }
  }

  async function duplicateWorld(name) {
    try {
      const result = await api.worlds.duplicate(name);
      await refresh(true);
      toast(`Creado «${result.name}».`, 'success', 'Mundo duplicado');
    } catch (err) {
      toastError(App.errorMessage(err), 'No se pudo duplicar');
    }
  }

  async function deleteWorld(name) {
    const confirmed = await App.confirmDialog({
      title: `¿Eliminar «${name}»?`,
      message: 'Se borrará el mundo completo. Crea antes una copia de seguridad si quieres conservarlo.',
      confirm: 'Eliminar mundo',
      icon: 'trash'
    });
    if (!confirmed) return;
    try {
      items = await api.worlds.remove(name);
      render();
      toast('Mundo eliminado.', 'success');
    } catch (err) {
      toastError(App.errorMessage(err), 'No se pudo eliminar');
    }
  }

  async function deleteBackup(file) {
    const confirmed = await App.confirmDialog({
      title: '¿Eliminar la copia?',
      message: `Se borrará «${file}».`,
      confirm: 'Eliminar copia',
      icon: 'trash'
    });
    if (!confirmed) return;
    try {
      backups = await api.worlds.deleteBackup(file);
      render();
      toast('Copia eliminada.', 'success');
    } catch (err) {
      toastError(App.errorMessage(err), 'No se pudo eliminar');
    }
  }

  async function openScreenshot(file) {
    const modal = App.openModal(`
      ${App.modalHead('CAPTURA', file, 'Vista previa de la captura de Minecraft.')}
      <div class="screenshot-lightbox"><span class="spinner"></span></div>`);
    try {
      const result = await api.screenshots.read(file);
      const host = $('.screenshot-lightbox', modal);
      if (host && result?.image) host.innerHTML = `<img src="${esc(result.image)}" alt="${esc(file)}">`;
    } catch (err) {
      const host = $('.screenshot-lightbox', modal);
      if (host) host.innerHTML = `<p class="help-text">${esc(App.errorMessage(err))}</p>`;
    }
  }

  async function deleteScreenshot(file) {
    const confirmed = await App.confirmDialog({
      title: '¿Eliminar la captura?',
      message: `Se borrará «${file}».`,
      confirm: 'Eliminar captura',
      icon: 'trash'
    });
    if (!confirmed) return;
    try {
      items = await api.screenshots.remove(file);
      render();
      toast('Captura eliminada.', 'success');
    } catch (err) {
      toastError(App.errorMessage(err), 'No se pudo eliminar');
    }
  }

  function init() {
    $('#content-tabs')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-ctab]');
      if (button) setTab(button.dataset.ctab);
    });

    $('#content-actions')?.addEventListener('click', (event) => {
      if (event.target.closest('[data-content-refresh]')) refresh(true);
      else if (event.target.closest('[data-content-add]')) addPacks();
      else {
        const open = event.target.closest('[data-content-open]');
        if (open) openFolder(open.dataset.contentOpen);
      }
    });

    $('#content-list')?.addEventListener('click', (event) => {
      const backupButton = event.target.closest('[data-world-backup]');
      if (backupButton) return backup(backupButton.dataset.worldBackup);
      const duplicateButton = event.target.closest('[data-world-duplicate]');
      if (duplicateButton) return duplicateWorld(duplicateButton.dataset.worldDuplicate);
      const openButton = event.target.closest('[data-world-open]');
      if (openButton) {
        api.worlds.open(openButton.dataset.worldOpen).catch((err) => toastError(App.errorMessage(err), 'No se pudo abrir el mundo'));
        return;
      }
      const deleteButton = event.target.closest('[data-world-delete]');
      if (deleteButton) return deleteWorld(deleteButton.dataset.worldDelete);
      const restoreButton = event.target.closest('[data-world-restore]');
      if (restoreButton) return restore(restoreButton.dataset.worldRestore);
      const deleteBackupButton = event.target.closest('[data-world-delete-backup]');
      if (deleteBackupButton) return deleteBackup(deleteBackupButton.dataset.worldDeleteBackup);

      const contentDelete = event.target.closest('[data-content-delete]');
      if (contentDelete) return deletePack(contentDelete.dataset.contentDelete);

      const screenshotOpen = event.target.closest('[data-screenshot-open]');
      if (screenshotOpen) return openScreenshot(screenshotOpen.dataset.screenshotOpen);
      const screenshotFile = event.target.closest('[data-screenshot-open-file]');
      if (screenshotFile) {
        api.screenshots.open(screenshotFile.dataset.screenshotOpenFile).catch((err) => toastError(App.errorMessage(err), 'No se pudo abrir la captura'));
        return;
      }
      const screenshotDelete = event.target.closest('[data-screenshot-delete]');
      if (screenshotDelete) return deleteScreenshot(screenshotDelete.dataset.screenshotDelete);
    });

    $('#content-list')?.addEventListener('change', (event) => {
      const toggle = event.target.closest('[data-content-toggle]');
      if (toggle) togglePack(toggle.dataset.contentToggle, toggle);
    });
  }

  App.content = { init, refresh, render, setTab };
})();
