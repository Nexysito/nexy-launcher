'use strict';

/* NexyLauncher 1.0 — aviso de nuevas versiones del launcher. */
(() => {
  const App = window.NexyApp;
  const api = App.api;
  const { $, state, toast, toastError } = App;

  let checking = false;
  let lastResult = null;

  function setText(selector, value) {
    const element = $(selector);
    if (element) element.textContent = value;
  }

  function notesText(notes) {
    const list = Array.isArray(notes) ? notes.filter(Boolean) : [];
    if (!list.length) return 'Mejoras de estabilidad y correcciones.';
    const head = list.slice(0, 2).join(' · ');
    return list.length > 2 ? `${head} · +${list.length - 2} más` : head;
  }

  function isDismissed(result) {
    return Boolean(result?.version && state.settings?.dismissedUpdateVersion === result.version);
  }

  function render() {
    const result = lastResult;

    const banner = $('#update-banner');
    if (banner) {
      const show = Boolean(result?.ok && result.available && !isDismissed(result));
      banner.hidden = !show;
      if (show) {
        setText('#update-banner-version', `NexyLauncher ${result.version}`);
        setText('#update-banner-notes', notesText(result.notes));
        const later = $('#btn-update-later');
        if (later) later.style.display = result.mandatory ? 'none' : '';
      }
    }

    const status = $('#about-update-status');
    if (status) {
      status.title = '';
      if (checking) {
        status.textContent = 'Comprobando…';
        status.className = '';
      } else if (!result) {
        status.textContent = 'Sin comprobar';
        status.className = '';
      } else if (!result.ok) {
        status.textContent = 'No se pudo comprobar';
        status.className = 'is-error';
        status.title = result.error || '';
      } else if (result.available) {
        status.textContent = `${result.version} disponible`;
        status.className = 'is-accent';
      } else {
        status.textContent = 'Estás al día';
        status.className = 'is-ok';
      }
    }

    const download = $('#btn-about-download');
    if (download) {
      const show = Boolean(result?.ok && result.available);
      download.hidden = !show;
      if (show) setText('#about-update-version', result.version);
    }
  }

  async function check(force = false) {
    if (checking) return lastResult;
    checking = true;
    render();

    try {
      const result = await api.updates.check(force);
      lastResult = result;

      if (force) {
        if (result?.ok && result.available) {
          toast(`NexyLauncher ${result.version} ya está disponible para descargar.`, 'info', 'Actualización disponible');
        } else if (result?.ok) {
          toast('Ya tienes la última versión de NexyLauncher.', 'success', 'Sin actualizaciones');
        } else {
          toastError(result?.error || 'No se pudo comprobar si hay actualizaciones.', 'Comprobación fallida');
        }
      }

      return result;
    } catch (error) {
      lastResult = { ok: false, error: error?.message || 'No se pudo comprobar si hay actualizaciones.' };
      if (force) toastError(lastResult.error, 'Comprobación fallida');
      return lastResult;
    } finally {
      checking = false;
      render();
    }
  }

  function openDownload() {
    const url = lastResult?.url;
    if (!url) return;
    api.openExternal(url)
      .then(() => toast('Descarga abierta en el navegador. Ejecuta el instalador sobre la versión actual: tus datos se conservan.', 'info', 'Descargando actualización'))
      .catch(() => toastError('No se pudo abrir el enlace de descarga.', 'Descarga no disponible'));
  }

  function dismiss() {
    const version = lastResult?.version;
    if (!version || lastResult?.mandatory || !state.settings) return;
    state.settings.dismissedUpdateVersion = version;
    render();
    api.settings.save({ dismissedUpdateVersion: version }).catch(() => {});
  }

  function init() {
    $('#btn-update-download')?.addEventListener('click', openDownload);
    $('#btn-update-later')?.addEventListener('click', dismiss);
    $('#btn-check-update')?.addEventListener('click', () => check(true));
    $('#btn-about-download')?.addEventListener('click', openDownload);
  }

  App.updates = { init, check, render };
})();
