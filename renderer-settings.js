'use strict';

/* NexyLauncher 1.0 — ajustes, Java y arranque final del renderer. */
(() => {
  const App = window.NexyApp;
  const api = App.api;
  const { $, $$, esc, icon, state, toast, toastError } = App;

  const AIKAR_FLAGS = '-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:+AlwaysPreTouch -XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 -XX:G1HeapRegionSize=8M -XX:G1ReservePercent=20 -XX:G1HeapWastePercent=5 -XX:G1MixedGCCountTarget=4 -XX:InitiatingHeapOccupancyPercent=15 -XX:G1MixedGCLiveThresholdPercent=90 -XX:G1RSetUpdatingPauseTimePercent=5 -XX:SurvivorRatio=32 -XX:+PerfDisableSharedMem -XX:MaxTenuringThreshold=1';

  let pendingPatch = {};
  let saveTimer = null;
  let saving = false;

  function setSaveState(kind) {
    const element = $('#save-state');
    if (!element) return;
    const label = kind === 'saving' ? 'Guardando…' : kind === 'error' ? 'Error al guardar' : 'Guardado';
    element.className = `save-state${kind === 'saving' ? ' saving' : kind === 'error' ? ' error' : ''}`;
    element.innerHTML = `<span class="dot"></span>${label}`;
  }

  function queuePatch(patch, immediate = false) {
    if (!state.settings) return;
    Object.assign(pendingPatch, patch);
    setSaveState('saving');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSettings, immediate ? 0 : 500);
  }

  async function flushSettings() {
    if (saving) {
      saveTimer = setTimeout(flushSettings, 250);
      return;
    }
    if (!Object.keys(pendingPatch).length) return;
    const patch = pendingPatch;
    pendingPatch = {};
    saving = true;
    try {
      const saved = await api.settings.save(patch);
      if (saved && typeof saved === 'object') state.settings = { ...state.settings, ...saved };
      if (!Object.keys(pendingPatch).length) setSaveState('saved');
      App.home?.renderStats?.();
    } catch (error) {
      setSaveState('error');
      toastError(App.errorMessage(error), 'No se pudo guardar');
    } finally {
      saving = false;
      if (Object.keys(pendingPatch).length) saveTimer = setTimeout(flushSettings, 150);
    }
  }

  function memoryCeiling() {
    const total = Number(state.system?.totalMemory) || 16;
    return Math.max(2, Math.min(32, total - 1));
  }

  function rangeFill(input) {
    const min = Number(input.min) || 1;
    const max = Number(input.max) || 16;
    const value = Number(input.value) || min;
    const percent = max > min ? ((value - min) / (max - min)) * 100 : 100;
    input.style.setProperty('--pct', `${percent}%`);
  }

  function updateMemoryUI() {
    const settings = state.settings;
    if (!settings) return;
    const ceiling = memoryCeiling();
    const minInput = $('#setting-min-mem');
    const maxInput = $('#setting-max-mem');
    if (!minInput || !maxInput) return;

    const min = App.clamp(settings.memory?.min ?? 2, 1, ceiling);
    const max = App.clamp(settings.memory?.max ?? 4, min, ceiling);
    settings.memory = { min, max };

    minInput.max = String(ceiling);
    maxInput.max = String(ceiling);
    minInput.value = String(min);
    maxInput.value = String(max);
    rangeFill(minInput);
    rangeFill(maxInput);

    const setText = (selector, value) => {
      const element = $(selector);
      if (element) element.textContent = value;
    };
    setText('#out-min-mem', `${min} GB`);
    setText('#out-max-mem', `${max} GB`);
    setText('#ram-value', `${min}–${max} GB`);
    setText('#ram-system', `${state.system.totalMemory || '—'} GB de RAM · ${state.system.freeMemory ?? '—'} GB libres`);
    setText('#ram-help', max >= (state.system.totalMemory || 16)
      ? 'Has asignado casi toda la memoria del sistema. Deja margen para Windows y el resto de aplicaciones.'
      : 'Deja margen para el sistema. Más memoria no siempre significa más FPS.');
  }

  function updateResolutionUI() {
    const settings = state.settings;
    if (!settings) return;
    const resolution = settings.resolution || { width: 1280, height: 720 };
    const width = $('#setting-width');
    const height = $('#setting-height');
    const chip = $('#resolution-value');
    if (width) width.value = String(resolution.width);
    if (height) height.value = String(resolution.height);
    if (chip) chip.textContent = `${resolution.width} × ${resolution.height}`;
  }

  function renderJava() {
    const settings = state.settings;
    const select = $('#setting-java');
    const list = $('#java-list');
    if (!settings || !select) return;

    const detected = Array.isArray(state.java) ? state.java.slice().sort((a, b) => b.major - a.major || b.version.localeCompare(a.version)) : [];
    const manual = settings.javaPath || '';
    const hasManual = detected.some((item) => item.path?.toLowerCase() === manual.toLowerCase());
    const options = ['<option value="">Automático (recomendado)</option>'];
    for (const java of detected) {
      options.push(`<option value="${esc(java.path)}">Java ${esc(String(java.major))} · ${esc(java.vendor || 'Java')} ${esc(java.version || '')}</option>`);
    }
    if (manual && !hasManual) {
      options.push(`<option value="${esc(manual)}">Ruta manual · ${esc(manual)}</option>`);
    }
    select.innerHTML = options.join('');
    select.value = manual;

    const required = App.requiredJava(App.selectedVersion());
    const assignedPath = settings.javaPaths?.[String(required)] || '';
    const assigned = assignedPath
      ? detected.find((item) => item.path?.toLowerCase() === assignedPath.toLowerCase()) || null
      : null;
    if (list) {
      if (!detected.length) {
        list.innerHTML = '<span class="java-chip">No se detectó ninguna instalación</span>';
      } else {
        list.innerHTML = detected.slice(0, 6).map((java) => {
          const suitable = java.major === required || (!detected.some((item) => item.major === required) && java.major > required);
          return `
          <span class="java-chip ${suitable ? 'ok' : ''}" title="${esc(java.path)}">
            <span class="dot" style="background:${suitable ? 'var(--green)' : 'var(--yellow)'}"></span>
            ${esc(java.vendor || 'Java')} ${esc(String(java.major))}
          </span>`;
        }).join('') + (detected.length > 6 ? `<span class="java-chip">+${detected.length - 6} más</span>` : '');
      }
    }

    const help = $('#java-help');
    if (help) {
      const version = App.selectedVersion() || 'Minecraft';
      if (assigned) {
        help.textContent = `Java ${assigned.major} asignado a ${version}. Esta versión necesita Java ${required}+.`;
      } else if (manual) {
        help.textContent = `Ruta manual seleccionada. Minecraft ${version} necesita Java ${required} o superior.`;
      } else if (!detected.length) {
        help.textContent = state.javaReady
          ? `No se detectó Java. Minecraft ${version} necesita Java ${required}. Usa Instalar para descargarlo.`
          : 'Detectando instalaciones de Java en el sistema…';
      } else {
        const best = App.javaForVersion(App.selectedVersion());
        help.textContent = best && best.major >= required
          ? `Automático: se elegirá Java ${best.major} (${best.vendor || 'Java'} ${best.version}) para esta versión. Necesita Java ${required}+.`
          : `Falta Java ${required} para esta versión. Usa Instalar o Examinar para añadirlo.`;
      }
    }
  }

  function refreshSystem() {
    if (!state.settings) return;
    updateMemoryUI();
    const setText = (selector, value) => {
      const element = $(selector);
      if (element) element.textContent = value;
    };
    setText('#ram-system', `${state.system.totalMemory || '—'} GB de RAM · ${state.system.freeMemory ?? '—'} GB libres`);
    setText('#about-version', state.system.appVersion || '1.0.0');
    setText('#about-electron', state.system.electron || '—');
    setText('#about-chrome', state.system.chrome || '—');
    setText('#changelog-version', state.system.appVersion || '1.0.0');
  }

  function render() {
    const settings = state.settings;
    if (!settings) return;

    App.applyTheme(settings.theme);
    updateMemoryUI();
    updateResolutionUI();

    const setChecked = (selector, value) => {
      const element = $(selector);
      if (element) element.checked = Boolean(value);
    };
    setChecked('#setting-autologin', settings.autoLogin);
    setChecked('#setting-minimize', settings.minimizeOnLaunch);
    setChecked('#setting-snapshots', settings.showSnapshots);
    setChecked('#setting-fullscreen', settings.resolution?.fullscreen);

    const jvm = $('#setting-jvm-args');
    if (jvm) jvm.value = settings.jvmArgs || '';
    const game = $('#setting-game-args');
    if (game) game.value = settings.gameArgs || '';

    const provider = $('#setting-mod-provider');
    if (provider) provider.value = settings.modProvider === 'curseforge' ? 'curseforge' : 'modrinth';
    const key = $('#setting-curseforge-key');
    if (key && document.activeElement !== key) key.value = settings.curseforgeApiKey || '';
    const keyHelp = $('#curseforge-key-help');
    if (keyHelp) {
      keyHelp.textContent = settings.curseforgeApiKey
        ? 'API key guardada en este equipo. Pulsa Probar para comprobar que funciona.'
        : 'Se guarda solo en este equipo. Consigue una clave gratuita en el portal de desarrolladores de CurseForge.';
    }

    const aiKey = $('#setting-ai-key');
    if (aiKey) {
      if (document.activeElement !== aiKey) aiKey.value = '';
      aiKey.placeholder = settings.aiApiKeySet ? '•••••••• (guardada)' : 'sk-…';
    }
    const aiBase = $('#setting-ai-base');
    if (aiBase && document.activeElement !== aiBase) aiBase.value = settings.aiBaseUrl || 'https://api.openai.com/v1';
    const aiModel = $('#setting-ai-model');
    if (aiModel && document.activeElement !== aiModel) aiModel.value = settings.aiModel || 'gpt-4o-mini';
    setChecked('#setting-ai-autocrash', settings.aiAutoReadCrash);
    const aiHelp = $('#ai-key-help');
    if (aiHelp) {
      aiHelp.textContent = settings.aiApiKeySet
        ? 'API key guardada en este equipo. Solo se envía al proveedor configurado.'
        : 'Se guarda solo en este equipo y se envía únicamente al proveedor que elijas. Compatible con OpenAI y APIs compatibles.';
    }

    const root = $('#game-root-path');
    if (root) {
      root.textContent = settings.gameRoot || state.paths.gameRoot || '—';
      root.title = settings.gameRoot || '';
    }

    renderJava();
    refreshSystem();
    setSaveState('saved');
  }

  function commitResolution() {
    if (!state.settings) return;
    const widthInput = $('#setting-width');
    const heightInput = $('#setting-height');
    const width = Math.round(App.clamp(widthInput?.value, 640, 7680));
    const height = Math.round(App.clamp(heightInput?.value, 480, 4320));
    state.settings.resolution = { ...(state.settings.resolution || {}), width, height };
    if (widthInput) widthInput.value = String(width);
    if (heightInput) heightInput.value = String(height);
    const chip = $('#resolution-value');
    if (chip) chip.textContent = `${width} × ${height}`;
    queuePatch({ resolution: state.settings.resolution });
  }

  async function pickJava() {
    const button = $('#btn-browse-java');
    App.setBusy(button, true, 'Abriendo…');
    try {
      const result = await api.java.pick();
      if (!result || result.canceled) return;
      if (result.error) {
        toast(result.error, 'warning', 'Java no válido');
        return;
      }
      if (result.settings) state.settings = result.settings;
      if (result.java && !state.java.some((item) => item.path === result.java.path)) {
        state.java = [result.java, ...state.java].sort((a, b) => b.major - a.major);
      }
      App.refreshJava();
      toast(`Java ${result.java?.version || ''} seleccionado.`, 'success', 'Ruta actualizada');
    } catch (error) {
      toastError(App.errorMessage(error), 'No se pudo elegir Java');
    } finally {
      App.setBusy(button, false);
    }
  }

  async function installJava() {
    const button = $('#btn-install-java');
    const required = App.requiredJava(App.selectedVersion());
    App.setBusy(button, true, 'Preparando…');
    const unsubscribe = api.onJavaInstallProgress?.((progress) => {
      if (Number(progress?.major) !== required) return;
      if (progress.phase === 'download') {
        App.setBusy(button, true, progress.percent === null || progress.percent === undefined
          ? 'Descargando…'
          : `Descargando ${progress.percent}%`);
      } else if (progress.phase === 'extract') {
        App.setBusy(button, true, 'Extrayendo…');
      }
    });

    try {
      const result = await api.java.install(required);
      if (!result || result.canceled) return;
      if (result.settings) state.settings = result.settings;
      if (result.java && !state.java.some((item) => item.path === result.java.path)) {
        state.java = [result.java, ...state.java].sort((a, b) => b.major - a.major);
      }
      App.refreshJava();
      toast(`Java ${required} instalado y asignado a esta versión.`, 'success', 'Java instalado');
    } catch (error) {
      toastError(App.errorMessage(error), 'No se pudo instalar Java');
    } finally {
      unsubscribe?.();
      App.setBusy(button, false);
    }
  }

  async function detectJava() {
    const button = $('#btn-detect-java');
    App.setBusy(button, true);
    try {
      state.java = await api.java.detect(true);
      App.refreshJava();
      if (state.java.length) toast(`Se encontraron ${state.java.length} instalación${state.java.length === 1 ? '' : 'es'} de Java.`, 'success', 'Detección completada');
      else toast('No se encontró Java en las rutas habituales. Puedes seleccionarlo manualmente.', 'warning', 'Java no encontrado');
    } catch (error) {
      toastError(App.errorMessage(error), 'Error al detectar Java');
    } finally {
      App.setBusy(button, false);
    }
  }

  async function openFolder(key) {
    try {
      await api.openFolder(key);
    } catch (error) {
      toastError(App.errorMessage(error), 'No se pudo abrir la carpeta');
    }
  }

  async function changeGameRoot() {
    if (state.launch.active) {
      toast('No cambies la carpeta del juego mientras Minecraft está en marcha.', 'warning');
      return;
    }
    try {
      const result = await api.settings.pickGameRoot();
      if (!result || result.canceled) return;
      App.applyInstanceState(result);
      toast('Carpeta de la instancia actualizada.', 'success', 'Almacenamiento');
    } catch (error) {
      toastError(App.errorMessage(error), 'No se pudo cambiar la carpeta');
    }
  }

  async function resetSettings() {
    const accepted = await App.confirmDialog({
      title: '¿Restablecer todos los ajustes?',
      message: 'Se restaurarán el tema, la memoria, la resolución, Java y los argumentos. No se borran partidas, versiones, mods ni perfiles.',
      confirm: 'Restablecer ajustes',
      icon: 'refresh'
    });
    if (!accepted) return;
    try {
      state.settings = await api.settings.reset();
      state.loader = state.settings.lastLoader || 'vanilla';
      state.loaderVersion = state.settings.lastLoaderVersion || '';
      state.modProvider = state.settings.modProvider || 'modrinth';
      App.applyTheme(state.settings.theme);
      render();
      App.home?.render?.();
      App.mods?.render?.();
      toast('Ajustes restablecidos a los valores recomendados.', 'success', 'Configuración limpia');
    } catch (error) {
      toastError(App.errorMessage(error), 'No se pudo restablecer');
    }
  }

  function init() {
    $('#btn-feedback-discord-dm')?.addEventListener('click', () => App.openFeedback('discord-user'));
    $('#btn-feedback-form')?.addEventListener('click', () => App.openFeedback('form'));
    $('#btn-copy-diagnostics')?.addEventListener('click', () => App.copyDiagnostics());
    $('#btn-feedback-logs')?.addEventListener('click', () => App.openLogs());

    $$('.theme-dot').forEach((button) => {
      button.addEventListener('click', () => {
        if (!state.settings) return;
        const theme = button.dataset.theme;
        state.settings.theme = theme;
        App.applyTheme(theme);
        queuePatch({ theme }, true);
      });
    });

    $('#setting-autologin')?.addEventListener('change', (event) => {
      state.settings.autoLogin = event.target.checked;
      queuePatch({ autoLogin: event.target.checked });
    });
    $('#setting-minimize')?.addEventListener('change', (event) => {
      state.settings.minimizeOnLaunch = event.target.checked;
      queuePatch({ minimizeOnLaunch: event.target.checked });
    });
    $('#setting-snapshots')?.addEventListener('change', (event) => {
      state.settings.showSnapshots = event.target.checked;
      queuePatch({ showSnapshots: event.target.checked });
      App.home?.render?.();
    });
    $('#setting-fullscreen')?.addEventListener('change', (event) => {
      state.settings.resolution = { ...(state.settings.resolution || {}), fullscreen: event.target.checked };
      queuePatch({ resolution: state.settings.resolution });
    });

    const minInput = $('#setting-min-mem');
    const maxInput = $('#setting-max-mem');
    minInput?.addEventListener('input', () => {
      const ceiling = memoryCeiling();
      let min = Math.round(App.clamp(minInput.value, 1, ceiling));
      let max = Math.round(App.clamp(maxInput.value, min, ceiling));
      if (min > max) {
        max = min;
        maxInput.value = String(max);
      }
      state.settings.memory = { min, max };
      updateMemoryUI();
      queuePatch({ memory: state.settings.memory });
    });
    maxInput?.addEventListener('input', () => {
      const ceiling = memoryCeiling();
      let max = Math.round(App.clamp(maxInput.value, 1, ceiling));
      let min = Math.round(App.clamp(minInput.value, 1, max));
      if (min > max) {
        min = max;
        minInput.value = String(min);
      }
      state.settings.memory = { min, max };
      updateMemoryUI();
      queuePatch({ memory: state.settings.memory });
    });

    $('#setting-jvm-args')?.addEventListener('input', App.debounce((event) => {
      state.settings.jvmArgs = event.target.value;
      queuePatch({ jvmArgs: event.target.value });
    }, 600));
    $('#setting-game-args')?.addEventListener('input', App.debounce((event) => {
      state.settings.gameArgs = event.target.value;
      queuePatch({ gameArgs: event.target.value });
    }, 600));

    $('#btn-aikar')?.addEventListener('click', () => {
      const input = $('#setting-jvm-args');
      if (!input) return;
      if (input.value.trim() === AIKAR_FLAGS) {
        input.value = '';
        state.settings.jvmArgs = '';
        queuePatch({ jvmArgs: '' }, true);
        toast('Flags de Aikar eliminados.', 'info');
      } else {
        input.value = AIKAR_FLAGS;
        state.settings.jvmArgs = AIKAR_FLAGS;
        queuePatch({ jvmArgs: AIKAR_FLAGS }, true);
        toast('Se añadieron los flags recomendados de Aikar para G1GC.', 'success', 'Argumentos JVM');
      }
    });

    $('#setting-mod-provider')?.addEventListener('change', (event) => {
      if (!state.settings) return;
      const provider = event.target.value === 'curseforge' ? 'curseforge' : 'modrinth';
      state.settings.modProvider = provider;
      state.modProvider = provider;
      state.modResults = [];
      state.modOffset = 0;
      state.modError = null;
      queuePatch({ modProvider: provider }, true);
      App.mods?.render?.();
      if (provider === 'curseforge' && !String(state.settings.curseforgeApiKey || '').trim()) {
        toast('Añade tu API key de CurseForge para buscar en su catálogo. Modrinth sigue disponible sin cuenta.', 'info', 'CurseForge');
      }
    });

    $('#setting-curseforge-key')?.addEventListener('input', App.debounce((event) => {
      if (!state.settings) return;
      const value = event.target.value.trim();
      state.settings.curseforgeApiKey = value;
      queuePatch({ curseforgeApiKey: value });
      const help = $('#curseforge-key-help');
      if (help) {
        help.textContent = value
          ? 'API key guardada en este equipo. Pulsa Probar para comprobar que funciona.'
          : 'Se guarda solo en este equipo. Consigue una clave gratuita en el portal de desarrolladores de CurseForge.';
      }
      state.modResults = [];
      state.modError = null;
      App.mods?.render?.();
    }, 650));

    $('#btn-test-curseforge')?.addEventListener('click', async () => {
      if (!state.settings) return;
      const button = $('#btn-test-curseforge');
      const key = String($('#setting-curseforge-key')?.value || '').trim();
      if (!key) {
        toast('Escribe primero tu API key de CurseForge.', 'warning', 'Falta la clave');
        return;
      }
      state.settings.curseforgeApiKey = key;
      App.setBusy(button, true, 'Probando…');
      try {
        await api.settings.save({ curseforgeApiKey: key });
        const result = await api.curseforge.test();
        toast(`La API key funciona. CurseForge tiene ${Number(result?.total || 0).toLocaleString('es-ES')} mods disponibles.`, 'success', 'Conexión correcta');
        const help = $('#curseforge-key-help');
        if (help) help.textContent = 'API key válida y guardada en este equipo.';
      } catch (error) {
        toastError(App.errorMessage(error), 'La API key no funciona');
      } finally {
        App.setBusy(button, false);
      }
    });

    $('#setting-ai-key')?.addEventListener('input', App.debounce((event) => {
      if (!state.settings) return;
      const value = event.target.value.trim();
      state.settings.aiApiKeySet = Boolean(value) || state.settings.aiApiKeySet;
      queuePatch({ aiApiKey: value });
      const help = $('#ai-key-help');
      if (help) {
        help.textContent = value
          ? 'API key lista. Pulsa Probar para comprobar que funciona.'
          : 'Se guarda solo en este equipo y se envía únicamente al proveedor que elijas.';
      }
      App.ai?.render?.();
    }, 700));

    $('#setting-ai-base')?.addEventListener('input', App.debounce((event) => {
      if (!state.settings) return;
      state.settings.aiBaseUrl = event.target.value.trim();
      queuePatch({ aiBaseUrl: event.target.value.trim() });
    }, 700));

    $('#setting-ai-model')?.addEventListener('input', App.debounce((event) => {
      if (!state.settings) return;
      state.settings.aiModel = event.target.value.trim();
      queuePatch({ aiModel: event.target.value.trim() });
      App.ai?.render?.();
    }, 700));

    $('#setting-ai-autocrash')?.addEventListener('change', (event) => {
      if (!state.settings) return;
      state.settings.aiAutoReadCrash = event.target.checked;
      queuePatch({ aiAutoReadCrash: event.target.checked }, true);
    });

    $('#btn-test-ai')?.addEventListener('click', async () => {
      if (!state.settings) return;
      const button = $('#btn-test-ai');
      const typed = String($('#setting-ai-key')?.value || '').trim();
      if (!typed && !state.settings.aiApiKeySet) {
        toast('Escribe primero tu API key del asistente.', 'warning', 'Falta la clave');
        return;
      }
      App.setBusy(button, true, 'Probando…');
      try {
        if (typed) {
          state.settings.aiApiKeySet = true;
          const saved = await api.settings.save({ aiApiKey: typed });
          if (saved && typeof saved === 'object') state.settings = { ...state.settings, ...saved };
          const input = $('#setting-ai-key');
          if (input) {
            input.value = '';
            input.placeholder = '•••••••• (guardada)';
          }
        }
        const result = await api.ai.test();
        const help = $('#ai-key-help');
        if (help) help.textContent = `Conexión correcta con ${result.model || 'el modelo configurado'}.`;
        toast(`La API key funciona. Modelo: ${result.model || '—'}.`, 'success', 'Asistente conectado');
        App.ai?.render?.();
      } catch (error) {
        toastError(App.errorMessage(error), 'No se pudo conectar con el asistente');
      } finally {
        App.setBusy(button, false);
      }
    });

    $('#btn-ai-clear-key')?.addEventListener('click', async () => {
      if (!state.settings?.aiApiKeySet) {
        toast('No hay ninguna clave guardada.', 'info');
        return;
      }
      try {
        const saved = await api.settings.save({ aiApiKey: '' });
        if (saved && typeof saved === 'object') state.settings = { ...state.settings, ...saved };
        const input = $('#setting-ai-key');
        if (input) {
          input.value = '';
          input.placeholder = 'sk-…';
        }
        const help = $('#ai-key-help');
        if (help) help.textContent = 'Se guarda solo en este equipo y se envía únicamente al proveedor que elijas.';
        App.ai?.render?.();
        toast('API key eliminada de este equipo.', 'success', 'Clave borrada');
      } catch (error) {
        toastError(App.errorMessage(error), 'No se pudo borrar la clave');
      }
    });

    $('#setting-width')?.addEventListener('change', commitResolution);
    $('#setting-height')?.addEventListener('change', commitResolution);
    $('#btn-reset-resolution')?.addEventListener('click', () => {
      state.settings.resolution = { ...(state.settings.resolution || {}), width: 1280, height: 720 };
      updateResolutionUI();
      queuePatch({ resolution: state.settings.resolution });
    });

    $('#setting-java')?.addEventListener('change', (event) => {
      state.settings.javaPath = event.target.value;
      queuePatch({ javaPath: event.target.value }, true);
      renderJava();
      App.home?.renderJava?.();
    });
    $('#btn-browse-java')?.addEventListener('click', pickJava);
    $('#btn-install-java')?.addEventListener('click', installJava);
    $('#btn-detect-java')?.addEventListener('click', detectJava);

    $('#btn-change-root')?.addEventListener('click', changeGameRoot);
    $('#btn-open-root')?.addEventListener('click', () => openFolder('gameRoot'));
    $('#btn-open-logs')?.addEventListener('click', () => openFolder('logs'));
    $('#btn-open-data')?.addEventListener('click', () => openFolder('data'));
    $('#btn-reset-settings')?.addEventListener('click', resetSettings);

    window.addEventListener('beforeunload', () => {
      if (Object.keys(pendingPatch).length) flushSettings();
    });
  }

  App.settings = { init, render, renderJava, refreshSystem };

  /* Arranca cuando todos los módulos están registrados. */
  App.start();
})();
