'use strict';

/* NexyLauncher 1.0 — asistente de IA, crashes y arreglos automáticos. */
(() => {
  const App = window.NexyApp;
  const api = App.api;
  const { $, esc, icon, state, toast, toastError } = App;

  const local = {
    messages: [],
    sending: false,
    applying: false,
    includeContext: true,
    crash: null,
    backups: [],
    counter: 0
  };

  const SUGGESTIONS = [
    '¿Qué versión de Java necesita mi instancia?',
    'Revisa mis mods y dime si hay conflictos',
    '¿Cómo mejoro los FPS sin romper los mods?',
    '¿Qué puedo hacer si Minecraft no arranca?'
  ];

  const ACTION_LABELS = {
    disable_mod: (action) => `Desactivar ${action.file || 'un mod'}`,
    enable_mod: (action) => `Activar ${action.file || 'un mod'}`,
    remove_mod: (action) => `Eliminar ${action.file || 'un mod'}`,
    set_memory: (action) => `Ajustar la RAM a ${action.min ?? '?'}–${action.max ?? '?'} GB`,
    set_jvm_args: (action) => `Cambiar los argumentos JVM`,
    set_java_path: (action) => `Usar Java en ${action.value || 'una ruta nueva'}`,
    repair_instance: () => 'Verificar y reparar los archivos de la instancia'
  };

  function uid() {
    local.counter += 1;
    return `ai-${Date.now()}-${local.counter}`;
  }

  function configured() {
    return Boolean(state.settings?.aiApiKeySet);
  }

  function formatAiText(value) {
    let text = esc(String(value || ''));
    text = text.replace(/```(?:[a-z]*)\n?([\s\S]*?)```/gi, (_, code) => `<pre class="ai-code">${code.trim()}</pre>`);
    text = text.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/^#{1,3}\s+(.+)$/gm, '<strong>$1</strong>');
    text = text.replace(/\n/g, '<br>');
    return text;
  }

  function severityLabel(severity) {
    return severity === 'high' ? 'Grave' : severity === 'medium' ? 'Media' : severity === 'low' ? 'Leve' : 'Aviso';
  }

  function actionLabel(action) {
    const builder = ACTION_LABELS[action?.type];
    return builder ? builder(action) : String(action?.type || 'Cambio');
  }

  function crashCard(message) {
    const crash = message.crash || {};
    const analysis = crash.analysis || null;
    const issues = analysis?.issues || [];
    const severity = analysis?.severity || 'medium';
    const sources = crash.sources || [];
    const when = crash.at ? new Date(crash.at).toLocaleString('es-ES') : '';
    const status = message.accepted
      ? '<p class="ai-crash-accepted"><span class="dot"></span>Registro enviado a la IA. Puede tardar unos segundos.</p>'
      : message.ignored
        ? '<p class="ai-crash-accepted muted">Registro ignorado. No se han gastado tokens.</p>'
        : `<div class="ai-crash-actions">
            <button type="button" class="btn btn-primary btn-sm" data-crash-read="${esc(message.id)}">${icon('sparkles')}Sí, que la IA lo lea</button>
            <button type="button" class="btn btn-ghost btn-sm" data-crash-ignore="${esc(message.id)}">Ignorar</button>
          </div>`;

    return `
      <article class="ai-crash ${message.ignored ? 'ignored' : ''}">
        <div class="ai-crash-head">
          <span class="ai-crash-icon">${icon('alert')}</span>
          <div class="ai-crash-title">
            <strong>Minecraft se cerró inesperadamente</strong>
            <small>${esc(crash.instanceName || 'Instancia')}${crash.version ? ` · ${esc(crash.version)}` : ''} · código ${esc(String(crash.code ?? '—'))}${when ? ` · ${esc(when)}` : ''}</small>
          </div>
          <span class="ai-severity ${esc(severity)}">${esc(severityLabel(severity))}</span>
        </div>
        ${analysis?.description ? `<p class="ai-crash-desc">${esc(analysis.description)}</p>` : ''}
        ${issues.length ? `<ul class="ai-crash-issues">${issues.map((issue) => `<li><strong>${esc(issue.title)}</strong><span>${esc(issue.detail || '')}</span></li>`).join('')}</ul>` : ''}
        ${analysis?.suspectedMods ? `<p class="ai-crash-mods">Mods sospechosos: <code>${esc(analysis.suspectedMods)}</code></p>` : ''}
        ${status}
        <div class="ai-crash-foot">
          <span>${sources.length ? sources.map((source) => `${esc(source.file)} · ${App.formatBytes(source.size)}`).join(' · ') : 'Sin archivos de registro'}</span>
          ${crash.preview ? `<details class="ai-crash-preview"><summary>Ver extracto</summary><pre>${esc(crash.preview)}</pre></details>` : ''}
        </div>
      </article>`;
  }

  function actionsCard(message) {
    return `
      <div class="ai-actions">
        <div class="ai-actions-head"><strong>Arreglo propuesto</strong><span>Se guardará una copia antes de tocar nada</span></div>
        <ul>${message.actions.map((action) => `<li>${esc(actionLabel(action))}</li>`).join('')}</ul>
        <div class="ai-actions-buttons">
          <button type="button" class="btn btn-primary btn-sm" data-ai-apply="${esc(message.id)}">${icon('check')}Aplicar arreglo</button>
          <button type="button" class="btn btn-ghost btn-sm" data-ai-dismiss="${esc(message.id)}">Descartar</button>
        </div>
      </div>`;
  }

  function appliedCard(message) {
    const applied = message.applied || [];
    const failed = message.failed || [];
    return `
      <div class="ai-applied">
        <div class="ai-actions-head">
          <strong>${message.restored ? 'Cambios restaurados' : 'Arreglo aplicado'}</strong>
          <span>${message.restored ? 'Se recuperó el estado anterior al arreglo' : 'Puedes deshacerlo si algo falla'}</span>
        </div>
        ${applied.length ? `<ul class="ok">${applied.map((item) => `<li>${esc(item.detail || item.type)}</li>`).join('')}</ul>` : ''}
        ${failed.length ? `<ul class="bad">${failed.map((item) => `<li>${esc(item.type)}: ${esc(item.error)}</li>`).join('')}</ul>` : ''}
        ${message.backup && !message.restored
          ? `<button type="button" class="btn btn-ghost btn-sm" data-ai-restore="${esc(message.backup.id)}" data-msg="${esc(message.id)}">${icon('refresh')}Restaurar antes del arreglo</button>`
          : ''}
      </div>`;
  }

  function messageHtml(message) {
    if (message.kind === 'crash') return crashCard(message);
    const mine = message.role === 'user';
    return `
      <article class="ai-msg ${mine ? 'user' : 'assistant'}">
        <span class="ai-avatar">${icon(mine ? 'user' : 'sparkles')}</span>
        <div class="ai-bubble-wrap">
          <div class="ai-bubble">${formatAiText(message.content)}</div>
          ${message.crashAttached ? '<span class="ai-attach"><span class="dot"></span>Registro de crash adjunto</span>' : ''}
          ${message.error ? `<p class="ai-error">${esc(message.error)}</p>` : ''}
          ${message.actions?.length ? actionsCard(message) : ''}
          ${message.applied ? appliedCard(message) : ''}
        </div>
      </article>`;
  }

  function emptyState() {
    return `
      <div class="ai-empty">
        <span class="ai-empty-icon">${icon('sparkles')}</span>
        <h3>¿En qué te ayudo?</h3>
        <p>Puedo leer la configuración de tu launcher, revisar mods, explicarte un crash y proponer arreglos que puedes deshacer.</p>
        <div class="ai-suggestions">
          ${SUGGESTIONS.map((text) => `<button type="button" class="ai-suggestion" data-ai-suggest="${esc(text)}">${esc(text)}</button>`).join('')}
        </div>
        ${configured() ? '' : '<p class="ai-empty-warn">Añade tu API key en Ajustes → Asistente de IA para empezar.</p>'}
      </div>`;
  }

  function render() {
    const chat = $('#ai-chat');
    if (!chat) return;
    const nearBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 120;
    chat.innerHTML = local.messages.length ? local.messages.map(messageHtml).join('') : emptyState();
    if (local.sending) {
      chat.insertAdjacentHTML('beforeend', `
        <article class="ai-msg assistant">
          <span class="ai-avatar">${icon('sparkles')}</span>
          <div class="ai-bubble-wrap"><div class="ai-bubble ai-typing"><span></span><span></span><span></span></div></div>
        </article>`);
    }
    updateHeader();
    updateRailAlert();
    if (nearBottom && state.page === 'ai') chat.scrollTop = chat.scrollHeight;
  }

  function updateHeader() {
    const chip = $('#ai-model-chip');
    if (chip) {
      chip.textContent = configured() ? (state.settings?.aiModel || 'Modelo sin nombre') : 'Sin API key';
      chip.classList.toggle('ready', configured());
    }
    const undo = $('#btn-ai-undo');
    if (undo) undo.hidden = !local.backups.length;
    const send = $('#btn-ai-send');
    if (send) send.disabled = local.sending;
    const note = $('#ai-foot-note');
    if (note) {
      note.textContent = local.includeContext
        ? 'Se enviarán datos de tu instancia, mods y ajustes.'
        : 'No se enviará contexto del launcher.';
    }
  }

  function updateRailAlert() {
    const button = $('.rail-btn[data-page="ai"]');
    if (!button) return;
    const pending = local.messages.some((message) => message.kind === 'crash' && !message.accepted && !message.ignored);
    button.classList.toggle('has-alert', pending);
  }

  async function refreshBackups() {
    try {
      local.backups = await api.ai.backups();
    } catch {
      local.backups = [];
    }
    updateHeader();
  }

  async function sendMessage(raw, options = {}) {
    const text = String(raw || '').trim();
    if (local.sending || !text) return;
    if (!configured()) {
      toast('Configura tu API key en Ajustes → Asistente de IA para usar el asistente.', 'warning', 'Falta la API key');
      App.go('settings');
      return;
    }

    local.messages.push({ id: uid(), role: 'user', content: text, crashAttached: Boolean(options.crashId) });
    local.sending = true;
    render();
    const chat = $('#ai-chat');
    if (chat && state.page === 'ai') chat.scrollTop = chat.scrollHeight;

    try {
      const result = await api.ai.chat({
        messages: local.messages
          .filter((message) => !message.kind)
          .map((message) => ({ role: message.role, content: message.content })),
        includeContext: local.includeContext,
        crashId: options.crashId || undefined
      });
      local.messages.push({
        id: uid(),
        role: 'assistant',
        content: result.reply,
        actions: Array.isArray(result.actions) ? result.actions : [],
        usage: result.usage || null
      });
    } catch (error) {
      const message = App.errorMessage(error);
      local.messages.push({ id: uid(), role: 'assistant', content: '', error: message });
      toastError(message, 'El asistente no pudo responder');
    } finally {
      local.sending = false;
      render();
      const box = $('#ai-chat');
      if (box && state.page === 'ai') box.scrollTop = box.scrollHeight;
    }
  }

  async function readCrash(message) {
    if (!message?.crash || local.sending) return;
    if (!configured()) {
      toast('Configura tu API key en Ajustes → Asistente de IA para que la IA pueda leer el registro.', 'warning', 'Falta la API key');
      App.go('settings');
      return;
    }
    try {
      await api.ai.readCrash(message.crash.id);
    } catch (error) {
      toastError(App.errorMessage(error), 'El registro ya no está disponible');
      return;
    }
    message.accepted = true;
    render();
    await sendMessage(
      'He tenido un crash en Minecraft. Analiza el registro, dime la causa más probable y propón un arreglo si puedes.',
      { crashId: message.crash.id }
    );
  }

  function ignoreCrash(message) {
    message.ignored = true;
    local.crash = null;
    api.ai.clearCrash().catch(() => {});
    render();
    toast('Registro ignorado. No se ha enviado nada a la IA.', 'info');
  }

  async function applyFix(message, button) {
    if (!message?.actions?.length || local.applying) return;
    local.applying = true;
    App.setBusy(button, true, 'Aplicando…');
    try {
      const result = await api.ai.apply({ actions: message.actions, crashId: local.crash?.id });
      message.actions = null;
      message.applied = result.applied || [];
      message.failed = result.failed || [];
      message.backup = result.backup || null;
      if (result.settings) App.applyInstanceState(result);
      refreshBackups();
      const count = message.applied.length;
      toast(
        count
          ? `${count} cambio${count === 1 ? '' : 's'} aplicado${count === 1 ? '' : 's'}. Si algo falla, pulsa Restaurar.`
          : 'No se pudo aplicar ningún cambio.',
        count ? 'success' : 'warning',
        'Arreglo de la IA'
      );
    } catch (error) {
      toastError(App.errorMessage(error), 'No se pudo aplicar el arreglo');
    } finally {
      local.applying = false;
      App.setBusy(button, false);
      render();
    }
  }

  async function restoreBackup(id, message = null) {
    const accepted = await App.confirmDialog({
      title: '¿Restaurar antes del arreglo?',
      message: 'Se recuperarán los mods y ajustes que había justo antes de que la IA tocara nada. Los cambios posteriores a ese momento también se perderán.',
      confirm: 'Restaurar',
      icon: 'refresh'
    });
    if (!accepted) return;
    try {
      const result = await api.ai.restore({ id });
      if (message) message.restored = true;
      App.applyInstanceState(result);
      await refreshBackups();
      render();
      toast('Se restauró el estado anterior al arreglo de la IA.', 'success', 'Cambios deshechos');
    } catch (error) {
      toastError(App.errorMessage(error), 'No se pudo restaurar');
    }
  }

  async function undoLatest() {
    if (!local.backups.length) {
      toast('No hay ningún arreglo de la IA que deshacer.', 'info');
      return;
    }
    await restoreBackup(local.backups[0].id);
  }

  function bind() {
    $('#ai-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const input = $('#ai-input');
      const value = input?.value || '';
      if (input) {
        input.value = '';
        input.style.height = '';
      }
      sendMessage(value);
    });

    $('#ai-input')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        $('#ai-form')?.requestSubmit();
      }
    });

    $('#ai-input')?.addEventListener('input', (event) => {
      const input = event.target;
      input.style.height = 'auto';
      input.style.height = `${Math.min(160, input.scrollHeight)}px`;
    });

    $('#ai-include-context')?.addEventListener('change', (event) => {
      local.includeContext = event.target.checked;
      updateHeader();
    });

    $('#btn-ai-settings')?.addEventListener('click', () => {
      App.go('settings');
      setTimeout(() => {
        const card = $('#ai-settings-card');
        card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        $('#setting-ai-key')?.focus();
      }, 250);
    });

    $('#btn-ai-clear')?.addEventListener('click', () => {
      local.messages = local.messages.filter((message) => message.kind === 'crash');
      render();
    });

    $('#btn-ai-undo')?.addEventListener('click', undoLatest);

    $('#ai-chat')?.addEventListener('click', (event) => {
      const suggestion = event.target.closest('[data-ai-suggest]');
      if (suggestion) {
        sendMessage(suggestion.dataset.aiSuggest);
        return;
      }

      const read = event.target.closest('[data-crash-read]');
      if (read) {
        const message = local.messages.find((item) => item.id === read.dataset.crashRead);
        if (message) readCrash(message);
        return;
      }

      const ignore = event.target.closest('[data-crash-ignore]');
      if (ignore) {
        const message = local.messages.find((item) => item.id === ignore.dataset.crashIgnore);
        if (message) ignoreCrash(message);
        return;
      }

      const apply = event.target.closest('[data-ai-apply]');
      if (apply) {
        const message = local.messages.find((item) => item.id === apply.dataset.aiApply);
        if (message) applyFix(message, apply);
        return;
      }

      const dismiss = event.target.closest('[data-ai-dismiss]');
      if (dismiss) {
        const message = local.messages.find((item) => item.id === dismiss.dataset.aiDismiss);
        if (message) {
          message.actions = null;
          render();
        }
        return;
      }

      const restore = event.target.closest('[data-ai-restore]');
      if (restore) {
        const message = local.messages.find((item) => item.id === restore.dataset.msg);
        restoreBackup(restore.dataset.aiRestore, message || null);
      }
    });
  }

  function onCrash(crash, options = {}) {
    if (!crash) return;
    local.crash = crash;
    if (!local.messages.some((message) => message.kind === 'crash' && message.crash.id === crash.id)) {
      local.messages.push({ id: uid(), kind: 'crash', crash, accepted: false, ignored: false });
    }
    render();
    if (!options.silent) {
      toast(
        'Minecraft se cerró. Abre el Asistente para decidir si la IA lee el registro.',
        'warning',
        'Crash detectado'
      );
    }
    if (state.settings?.aiAutoReadCrash && configured()) {
      const message = local.messages.find((item) => item.kind === 'crash' && item.crash.id === crash.id);
      if (message && !message.accepted && !message.ignored) {
        setTimeout(() => readCrash(message), 700);
      }
    }
  }

  function init() {
    bind();
    api.ai.pendingCrash?.().then((crash) => {
      if (crash) onCrash(crash, { silent: true });
    }).catch(() => {});
    refreshBackups();
  }

  App.ai = { init, render, onCrash, sendMessage, refreshBackups };
})();
