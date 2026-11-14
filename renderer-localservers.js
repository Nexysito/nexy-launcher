'use strict';

/* NexyLauncher 1.1 — servidores locales. */
(() => {
  const App = window.NexyApp;
  const api = App.api;
  const { $, esc, icon, state, toast, toastError } = App;

  const buffers = new Map();
  const STATUS = {
    stopped: { label: 'Detenido', className: 'idle' },
    installing: { label: 'Instalando', className: 'loading' },
    starting: { label: 'Iniciando', className: 'loading' },
    running: { label: 'En línea', className: 'online' },
    stopping: { label: 'Deteniendo', className: 'loading' },
    error: { label: 'Error', className: 'offline' }
  };

  let openConsoleId = null;

  function serverById(id) {
    return state.localServers.find((item) => item.id === id) || null;
  }

  function statusInfo(server) {
    return STATUS[server.status] || STATUS.stopped;
  }

  function statusLabel(server) {
    if (server.status === 'installing' && Number.isFinite(server.download?.percent)) {
      return `Instalando ${server.download.percent}%`;
    }
    return statusInfo(server).label;
  }

  function isBusy(server) {
    return server.status === 'installing' || server.status === 'starting' || server.status === 'stopping';
  }

  function render() {
    const host = $('#local-servers-list');
    const empty = $('#local-servers-empty');
    if (!host || !empty) return;

    if (!state.localServers.length) {
      host.innerHTML = '';
      host.hidden = true;
      empty.hidden = false;
      return;
    }

    host.hidden = false;
    empty.hidden = true;
    host.innerHTML = state.localServers.map((server) => {
      const running = Boolean(server.pid);
      const busy = isBusy(server);
      const initial = (server.name.trim()[0] || 'S').toUpperCase();
      return `
        <article class="server-card local-server-card">
          <span class="server-icon local">${esc(initial)}</span>
          <div class="server-main">
            <strong title="${esc(server.name)}">${esc(server.name)}</strong>
            <span class="server-address" title="${esc(server.directory || '')}">${icon('cpu')}Minecraft ${esc(server.version)} · localhost:${server.port}</span>
            <span class="server-status ${statusInfo(server).className}" title="${esc(server.error || '')}"><span class="dot"></span>${esc(statusLabel(server))}</span>
          </div>
          <div class="server-actions">
            <button class="action-btn play" data-local-toggle="${esc(server.id)}" title="${running ? 'Detener servidor' : 'Iniciar servidor'}" aria-label="${running ? 'Detener servidor' : 'Iniciar servidor'}" ${busy ? 'disabled' : ''}>${icon(running ? 'stop' : 'play')}</button>
            <button class="action-btn" data-local-console="${esc(server.id)}" title="Abrir consola" aria-label="Abrir consola">${icon('terminal')}</button>
            <button class="action-btn" data-local-folder="${esc(server.id)}" title="Abrir carpeta" aria-label="Abrir carpeta">${icon('folder')}</button>
            <button class="action-btn danger" data-local-remove="${esc(server.id)}" title="Eliminar servidor" aria-label="Eliminar servidor" ${running || busy ? 'disabled' : ''}>${icon('trash')}</button>
          </div>
        </article>`;
    }).join('');
  }

  async function toggleServer(server, button = null) {
    const running = Boolean(server.pid);
    if (button) App.setBusy(button, true, running ? 'Deteniendo…' : 'Iniciando…');
    try {
      if (running) {
        const result = await api.localServers.stop(server.id);
        if (result?.servers) state.localServers = result.servers;
      } else {
        const result = await api.localServers.start(server.id);
        if (result?.servers) state.localServers = result.servers;
        toast(`Iniciando «${server.name}». Abre la consola para ver el progreso.`, 'success', 'Servidor iniciado');
      }
    } catch (error) {
      toastError(App.errorMessage(error), running ? 'No se pudo detener' : 'No se pudo iniciar');
    } finally {
      if (button) App.setBusy(button, false);
      render();
    }
  }

  async function openFolder(server, key = 'folder') {
    try {
      await api.localServers.openFolder({ id: server.id, key });
    } catch (error) {
      toastError(App.errorMessage(error), 'No se pudo abrir la carpeta');
    }
  }

  async function removeServer(server) {
    const accepted = await App.confirmDialog({
      title: `¿Eliminar “${server.name}”?`,
      message: 'Se borrará la carpeta del servidor, incluidos el mundo, los logs y la configuración. Esta acción no se puede deshacer.',
      confirm: 'Eliminar servidor',
      icon: 'trash'
    });
    if (!accepted) return;
    try {
      const result = await api.localServers.remove(server.id);
      state.localServers = result.servers || [];
      buffers.delete(server.id);
      if (openConsoleId === server.id) App.closeModal();
      render();
      toast(`«${server.name}» eliminado.`, 'success');
    } catch (error) {
      toastError(App.errorMessage(error), 'No se pudo eliminar');
    }
  }

  function appendConsoleLine(line) {
    const output = $('#server-console-output');
    if (!output) return;
    output.textContent += `${output.textContent ? '\n' : ''}${line}`;
    output.scrollTop = output.scrollHeight;
  }

  function refreshConsole(server) {
    if (!server || openConsoleId !== server.id) return;
    const status = document.querySelector('[data-console-status]');
    if (status) {
      status.className = `server-status ${statusInfo(server).className}`;
      status.innerHTML = `<span class="dot"></span>${esc(statusLabel(server))}`;
      status.title = server.error || '';
    }
    const input = $('#server-console-input');
    if (input) {
      input.disabled = !server.pid;
      input.placeholder = server.pid ? 'Escribe un comando: help, list, stop…' : 'Inicia el servidor para enviar comandos';
    }
    const toggle = document.querySelector('[data-console-toggle]');
    if (toggle) {
      const running = Boolean(server.pid);
      toggle.innerHTML = `${icon(running ? 'stop' : 'play')}${running ? 'Detener servidor' : 'Iniciar servidor'}`;
      toggle.classList.toggle('btn-primary', !running);
      toggle.classList.toggle('btn-ghost', running);
      toggle.disabled = isBusy(server);
    }
  }

  async function openConsole(server) {
    openConsoleId = server.id;
    const modal = App.openModal(`
      ${App.modalHead(
        'CONSOLA DEL SERVIDOR',
        server.name,
        `Minecraft ${server.version} · localhost:${server.port}`
      )}
      <div class="server-console-toolbar">
        <span class="server-status ${statusInfo(server).className}" data-console-status title="${esc(server.error || '')}"><span class="dot"></span>${esc(statusLabel(server))}</span>
        <div class="server-console-tools">
          <button type="button" class="text-btn" data-console-folder>${icon('folder')}Carpeta</button>
          <button type="button" class="text-btn" data-console-logs>${icon('archive')}Logs</button>
          <button type="button" class="text-btn" data-console-copy>${icon('copy')}Copiar</button>
        </div>
      </div>
      <pre id="server-console-output" class="server-console-output" tabindex="0"></pre>
      <form id="server-console-form" class="server-console-form">
        <span class="server-console-prompt mono">&gt;</span>
        <input id="server-console-input" class="text-input mono" type="text" maxlength="500" autocomplete="off" spellcheck="false" placeholder="${server.pid ? 'Escribe un comando: help, list, stop…' : 'Inicia el servidor para enviar comandos'}" ${server.pid ? '' : 'disabled'}>
        <button class="btn btn-primary btn-sm" type="submit">Enviar</button>
      </form>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-modal-close>Cerrar</button>
        <button type="button" class="btn ${server.pid ? 'btn-ghost' : 'btn-primary'}" data-console-toggle ${isBusy(server) ? 'disabled' : ''}>${icon(server.pid ? 'stop' : 'play')}${server.pid ? 'Detener servidor' : 'Iniciar servidor'}</button>
      </div>
    `, { wide: true, onClose: () => { openConsoleId = null; } });

    const output = $('#server-console-output', modal);
    const scrollback = buffers.get(server.id) || [];
    if (output) {
      output.textContent = scrollback.join('\n');
      output.scrollTop = output.scrollHeight;
    }

    const input = $('#server-console-input', modal);
    const form = $('#server-console-form', modal);

    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const command = String(input?.value || '').trim();
      if (!command) return;
      if (input) input.value = '';
      appendConsoleLine(`> ${command}`);
      try {
        await api.localServers.command({ id: server.id, command });
      } catch (error) {
        toastError(App.errorMessage(error), 'No se pudo enviar el comando');
      }
      input?.focus();
    });

    modal.querySelector('[data-console-toggle]')?.addEventListener('click', (event) => {
      const current = serverById(server.id) || server;
      toggleServer(current, event.currentTarget);
    });
    modal.querySelector('[data-console-folder]')?.addEventListener('click', () => openFolder(server, 'folder'));
    modal.querySelector('[data-console-logs]')?.addEventListener('click', () => openFolder(server, 'logs'));
    modal.querySelector('[data-console-copy]')?.addEventListener('click', async () => {
      if (await App.copyText(output?.textContent || '')) {
        toast('Consola copiada al portapapeles.', 'success');
      }
    });
  }

  function memoryOptions(selected) {
    return Array.from({ length: 32 }, (_, index) => index + 1)
      .map((value) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${value} GB</option>`)
      .join('');
  }

  async function openCreateModal() {
    const memory = state.settings?.memory || { min: 2, max: 4 };
    const modal = App.openModal(`
      ${App.modalHead('NUEVO SERVIDOR LOCAL', 'Crear un servidor', 'Se descargará el servidor oficial de Mojang y se preparará la carpeta de la instancia.')}
      <form id="local-server-form" novalidate>
        <div class="server-form-grid two">
          <div>
            <label class="field-label" for="local-name">Nombre</label>
            <input id="local-name" class="text-input" type="text" maxlength="40" placeholder="Supervivencia con amigos" autocomplete="off">
          </div>
          <div>
            <label class="field-label" for="local-version">Versión de Minecraft</label>
            <select id="local-version" class="text-input" disabled>
              <option value="">Cargando versiones…</option>
            </select>
            <p class="help-text" id="local-version-help">Solo se muestran versiones estables.</p>
          </div>
        </div>
        <div class="server-form-grid two">
          <div>
            <label class="field-label" for="local-port">Puerto</label>
            <input id="local-port" class="text-input mono" type="number" min="1024" max="65535" step="1" value="25565">
            <p class="help-text">25565 es el predeterminado. Se comprobará que esté libre.</p>
          </div>
          <div>
            <label class="field-label">Memoria</label>
            <div class="local-memory-row">
              <select id="local-mem-min" class="text-input">${memoryOptions(memory.min)}</select>
              <span>a</span>
              <select id="local-mem-max" class="text-input">${memoryOptions(memory.max)}</select>
              <span>GB</span>
            </div>
          </div>
        </div>
        <label class="check-row"><input type="checkbox" id="local-online" checked> Solo cuentas premium (online-mode)</label>
        <p class="help-text">Si lo desactivas podrás entrar con cuentas offline, pero cualquiera que conozca tu IP podrá usar el nombre que quiera.</p>
        <label class="check-row"><input type="checkbox" id="local-eula"> Acepto el <button type="button" class="inline-link" id="local-eula-link">EULA de Minecraft</button></label>
        <p class="help-text">El servidor se abrirá en tu red local. Para que entren amigos por internet tendrás que abrir el puerto en tu router o usar una VPN.</p>
        <p class="form-error" id="local-form-error" hidden></p>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" data-modal-close>Cancelar</button>
          <button type="submit" class="btn btn-primary" id="local-create">${icon('plus')}Crear servidor</button>
        </div>
      </form>
    `, { wide: true });

    const form = $('#local-server-form', modal);
    const nameInput = $('#local-name', modal);
    const versionSelect = $('#local-version', modal);
    const portInput = $('#local-port', modal);
    const minSelect = $('#local-mem-min', modal);
    const maxSelect = $('#local-mem-max', modal);
    const onlineInput = $('#local-online', modal);
    const eulaInput = $('#local-eula', modal);
    const errorBox = $('#local-form-error', modal);
    const createButton = $('#local-create', modal);
    const versionHelp = $('#local-version-help', modal);

    const showError = (message) => {
      errorBox.textContent = message;
      errorBox.hidden = false;
    };

    modal.querySelector('#local-eula-link')?.addEventListener('click', (event) => {
      event.preventDefault();
      api.openExternal('https://aka.ms/MinecraftEULA').catch(() => {});
    });

    try {
      const manifest = await api.versions.remote();
      const releases = (manifest.versions || []).filter((item) => item.type === 'release');
      const preferred = state.settings?.lastVersion || manifest.latest?.release || releases[0]?.id;
      versionSelect.innerHTML = releases
        .map((item) => `<option value="${esc(item.id)}" ${item.id === preferred ? 'selected' : ''}>${esc(item.id)}</option>`)
        .join('');
      versionSelect.disabled = !releases.length;
      if (!releases.length) {
        versionHelp.textContent = 'No se pudieron cargar las versiones. Revisa tu conexión.';
      }
    } catch (error) {
      versionSelect.innerHTML = '<option value="">Sin conexión</option>';
      versionHelp.textContent = App.errorMessage(error);
    }

    api.localServers.suggestPort()
      .then((result) => {
        if (portInput && result?.port) portInput.value = result.port;
      })
      .catch(() => {});

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      errorBox.hidden = true;
      const name = String(nameInput.value || '').trim();
      const version = String(versionSelect.value || '').trim();
      const port = Number(portInput.value);
      const min = Number(minSelect.value);
      const max = Number(maxSelect.value);

      if (!name) {
        showError('Escribe un nombre para el servidor.');
        nameInput.focus();
        return;
      }
      if (!version) {
        showError('Elige una versión de Minecraft.');
        versionSelect.focus();
        return;
      }
      if (!Number.isInteger(port) || port < 1024 || port > 65535) {
        showError('El puerto debe estar entre 1024 y 65535.');
        portInput.focus();
        return;
      }
      if (min > max) {
        showError('La memoria inicial no puede ser mayor que la máxima.');
        return;
      }
      if (!eulaInput.checked) {
        showError('Debes aceptar el EULA de Minecraft para crear el servidor.');
        return;
      }

      App.setBusy(createButton, true, 'Creando…');
      try {
        const result = await api.localServers.create({
          name,
          version,
          port,
          memory: { min, max },
          onlineMode: onlineInput.checked,
          eula: true
        });
        if (result?.servers) state.localServers = result.servers;
        App.closeModal();
        render();
        toast(`«${name}» creado. Descargando el servidor…`, 'success', 'Servidor creado');
      } catch (error) {
        showError(App.errorMessage(error));
      } finally {
        App.setBusy(createButton, false);
      }
    });

    setTimeout(() => nameInput.focus(), 80);
  }

  function handleEvent(event) {
    if (!event) return;
    const id = typeof event.id === 'string' ? event.id : event.server?.id;
    if (typeof id !== 'string') return;

    if (event.type === 'log') {
      const list = buffers.get(id) || [];
      list.push(event.line);
      if (list.length > 2500) list.splice(0, list.length - 2500);
      buffers.set(id, list);
      if (openConsoleId === id) appendConsoleLine(event.line);
      return;
    }

    if (event.type === 'download') {
      const server = serverById(id);
      if (!server) return;
      server.status = 'installing';
      server.download = {
        percent: event.percent,
        received: event.received,
        total: event.total
      };
      render();
      refreshConsole(server);
      return;
    }

    if (event.type === 'state' && event.server) {
      const index = state.localServers.findIndex((item) => item.id === event.server.id);
      if (index >= 0) state.localServers[index] = event.server;
      else state.localServers.push(event.server);
      render();
      refreshConsole(event.server);
    }
  }

  function init() {
    $('#btn-new-local-server')?.addEventListener('click', openCreateModal);
    $('#btn-new-local-server-empty')?.addEventListener('click', openCreateModal);

    $('#local-servers-list')?.addEventListener('click', (event) => {
      const toggle = event.target.closest('[data-local-toggle]');
      if (toggle) {
        const server = serverById(toggle.dataset.localToggle);
        if (server) toggleServer(server, toggle);
        return;
      }
      const consoleButton = event.target.closest('[data-local-console]');
      if (consoleButton) {
        const server = serverById(consoleButton.dataset.localConsole);
        if (server) openConsole(server);
        return;
      }
      const folderButton = event.target.closest('[data-local-folder]');
      if (folderButton) {
        const server = serverById(folderButton.dataset.localFolder);
        if (server) openFolder(server);
        return;
      }
      const removeButton = event.target.closest('[data-local-remove]');
      if (removeButton) {
        const server = serverById(removeButton.dataset.localRemove);
        if (server) removeServer(server);
      }
    });

    api.onLocalServerEvent?.(handleEvent);
  }

  App.localServers = { init, render, openConsole, openCreateModal, toggleServer };
})();
