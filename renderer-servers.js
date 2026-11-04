'use strict';

/* NexyLauncher 1.0 — lista de servidores. */
(() => {
  const App = window.NexyApp;
  const api = App.api;
  const { $, esc, icon, state, toast, toastError } = App;

  const statuses = new Map();
  let pinging = false;

  function validAddress(value) {
    const address = String(value || '').trim();
    const match = App.SERVER_RE.exec(address);
    if (!match) return false;
    if (match[1] && (Number(match[1]) < 1 || Number(match[1]) > 65535)) return false;
    return true;
  }

  function openServerModal(server = null) {
    const editing = Boolean(server);
    const modal = App.openModal(`
      ${App.modalHead(
        editing ? 'EDITAR SERVIDOR' : 'NUEVO SERVIDOR',
        editing ? 'Editar servidor' : 'Añadir un servidor',
        'Guarda tus servidores favoritos para entrar con un clic desde el inicio.'
      )}
      <form id="server-form" novalidate>
        <div class="server-form-grid">
          <div>
            <label class="field-label" for="server-name">Nombre</label>
            <input id="server-name" class="text-input" type="text" maxlength="40" placeholder="Mi servidor de supervivencia" autocomplete="off" value="${esc(server?.name || '')}">
          </div>
          <div>
            <label class="field-label" for="server-address">Dirección</label>
            <input id="server-address" class="text-input mono" type="text" maxlength="260" placeholder="play.ejemplo.net o 192.168.1.10:25565" autocomplete="off" spellcheck="false" value="${esc(server?.address || '')}">
            <p class="help-text">Puedes incluir el puerto. Si lo omites se usará 25565.</p>
          </div>
        </div>
        <p class="form-error" id="server-form-error" hidden></p>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" data-modal-close>Cancelar</button>
          <button type="submit" class="btn btn-primary" id="server-save">${icon(editing ? 'check' : 'plus')}${editing ? 'Guardar cambios' : 'Añadir servidor'}</button>
        </div>
      </form>`);

    const form = $('#server-form', modal);
    const nameInput = $('#server-name', modal);
    const addressInput = $('#server-address', modal);
    const errorBox = $('#server-form-error', modal);
    const save = $('#server-save', modal);

    const submit = async () => {
      const name = String(nameInput.value || '').trim();
      const address = String(addressInput.value || '').trim();
      errorBox.hidden = true;

      if (!name) {
        errorBox.textContent = 'Escribe un nombre para identificar el servidor.';
        errorBox.hidden = false;
        nameInput.focus();
        return;
      }
      if (!validAddress(address)) {
        errorBox.textContent = 'Dirección no válida. Ejemplo: play.ejemplo.net o play.ejemplo.net:25565.';
        errorBox.hidden = false;
        addressInput.focus();
        return;
      }

      App.setBusy(save, true, 'Guardando…');
      try {
        state.servers = await api.servers.save({ id: server?.id, name, address });
        App.closeModal();
        render();
        App.home?.renderQuickServers?.();
        toast(editing ? 'Servidor actualizado.' : 'Servidor añadido a tu lista.', 'success', editing ? 'Cambios guardados' : 'Servidor añadido');
      } catch (error) {
        errorBox.textContent = App.errorMessage(error);
        errorBox.hidden = false;
        App.setBusy(save, false);
      }
    };

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      submit();
    });

    setTimeout(() => nameInput.focus(), 80);
  }

  async function removeServer(server) {
    const accepted = await App.confirmDialog({
      title: `¿Eliminar “${server.name}”?`,
      message: `Se quitará ${server.address} de tu lista de servidores. Puedes volver a añadirlo cuando quieras.`,
      confirm: 'Eliminar servidor',
      icon: 'trash'
    });
    if (!accepted) return;
    try {
      state.servers = await api.servers.remove(server.id);
      render();
      App.home?.renderQuickServers?.();
      toast(`“${server.name}” eliminado de tu lista.`, 'success');
    } catch (error) {
      toastError(App.errorMessage(error), 'No se pudo eliminar');
    }
  }

  async function copyAddress(server) {
    if (await App.copyText(server.address)) {
      toast(`Dirección ${server.address} copiada.`, 'success');
    }
  }

  function statusMarkup(server) {
    const status = statuses.get(server.id);
    if (!status) {
      return `<span class="server-status loading" data-server-status="${esc(server.id)}"><span class="dot"></span>Comprobando…</span>`;
    }
    if (!status.online) {
      return `<span class="server-status offline" data-server-status="${esc(server.id)}" title="${esc(status.error || 'Sin conexión')}"><span class="dot"></span>${esc(status.error || 'Sin conexión')}</span>`;
    }
    const players = status.players || { online: 0, max: 0 };
    const parts = [`${players.online}/${players.max} jugadores`, `${status.latency} ms`];
    if (status.version) parts.push(status.version);
    return `<span class="server-status online" data-server-status="${esc(server.id)}" title="${esc(status.motd || '')}"><span class="dot"></span>${esc(parts.join(' · '))}</span>`;
  }

  function updateStatusNode(serverId) {
    const node = [...document.querySelectorAll('[data-server-status]')]
      .find((item) => item.dataset.serverStatus === serverId);
    const server = state.servers.find((item) => item.id === serverId);
    if (!node || !server) return;
    node.outerHTML = statusMarkup(server);
  }

  async function pingServer(server) {
    const result = await api.servers.ping(server.address).catch((error) => ({
      online: false,
      error: App.errorMessage(error)
    }));
    statuses.set(server.id, result);
    updateStatusNode(server.id);
    return result;
  }

  async function refreshStatuses(force = false) {
    if (pinging || !state.servers.length) return;
    if (force) statuses.clear();
    const targets = force ? state.servers : state.servers.filter((server) => !statuses.has(server.id));
    if (!targets.length) return;
    pinging = true;
    const button = $('#btn-refresh-servers');
    if (button) button.disabled = true;
    try {
      render();
      await Promise.all(targets.map((server) => pingServer(server)));
    } finally {
      pinging = false;
      if (button) button.disabled = false;
    }
  }

  function render() {
    const host = $('#servers-list');
    const empty = $('#servers-empty');
    if (!host || !empty) return;

    if (!state.servers.length) {
      host.innerHTML = '';
      host.hidden = true;
      empty.hidden = false;
      return;
    }

    host.hidden = false;
    empty.hidden = true;
    host.innerHTML = state.servers.map((server) => {
      const initial = (server.name.trim()[0] || 'S').toUpperCase();
      return `
        <article class="server-card">
          <span class="server-icon">${esc(initial)}</span>
          <div class="server-main">
            <strong title="${esc(server.name)}">${esc(server.name)}</strong>
            <span class="server-address" title="${esc(server.address)}">${icon('globe')}${esc(server.address)}</span>
            ${statusMarkup(server)}
          </div>
          <div class="server-actions">
            <button class="action-btn play" data-join-server="${esc(server.id)}" title="Jugar en ${esc(server.name)}">${icon('play')}</button>
            <button class="action-btn" data-copy-server="${esc(server.id)}" title="Copiar dirección">${icon('copy')}</button>
            <button class="action-btn" data-edit-server="${esc(server.id)}" title="Editar servidor">${icon('edit')}</button>
            <button class="action-btn danger" data-remove-server="${esc(server.id)}" title="Eliminar servidor">${icon('trash')}</button>
          </div>
        </article>`;
    }).join('');

    if (!pinging && state.page === 'servers') {
      const pending = state.servers.filter((server) => !statuses.has(server.id));
      if (pending.length) setTimeout(() => pending.forEach((server) => pingServer(server)), 80);
    }
  }

  function init() {
    $('#btn-add-server')?.addEventListener('click', () => openServerModal());
    $('#btn-add-server-empty')?.addEventListener('click', () => openServerModal());
    $('#btn-refresh-servers')?.addEventListener('click', () => refreshStatuses(true));

    $('#servers-list')?.addEventListener('click', (event) => {
      const join = event.target.closest('[data-join-server]');
      if (join) {
        const server = state.servers.find((item) => item.id === join.dataset.joinServer);
        if (server) App.home?.startGame?.(server.address);
        return;
      }
      const copy = event.target.closest('[data-copy-server]');
      if (copy) {
        const server = state.servers.find((item) => item.id === copy.dataset.copyServer);
        if (server) copyAddress(server);
        return;
      }
      const edit = event.target.closest('[data-edit-server]');
      if (edit) {
        const server = state.servers.find((item) => item.id === edit.dataset.editServer);
        if (server) openServerModal(server);
        return;
      }
      const remove = event.target.closest('[data-remove-server]');
      if (remove) {
        const server = state.servers.find((item) => item.id === remove.dataset.removeServer);
        if (server) removeServer(server);
      }
    });
  }

  App.servers = { init, render, openModal: openServerModal, validAddress, refreshStatuses };
})();
