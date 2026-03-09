// popup.js — Lógica del panel emergente

'use strict';

const $ = id => document.getElementById(id);

const ui = {
  statusDot:     $('statusDot'),
  statusText:    $('statusText'),
  enabledToggle: $('enabledToggle'),
  langSelect:    $('langSelect'),
  serverUrl:     $('serverUrl'),
  apiKey:        $('apiKey'),
  testBtn:       $('testBtn'),
  toggleKey:     $('toggleKey'),
  errBanner:     $('errBanner'),
};

// ─── Cargar configuración al abrir el popup ──────────────────────────────
chrome.storage.sync.get(['enabled', 'language', 'serverUrl', 'apiKey'], data => {
  ui.enabledToggle.checked = data.enabled !== false;
  ui.langSelect.value      = data.language   || 'auto';
  ui.serverUrl.value       = data.serverUrl  || 'http://localhost:8081';
  ui.apiKey.value          = data.apiKey     || '';

  verifyServer(ui.serverUrl.value, ui.apiKey.value);
});

// ─── Guardar al cambiar ──────────────────────────────────────────────────
ui.enabledToggle.addEventListener('change', () => {
  chrome.storage.sync.set({ enabled: ui.enabledToggle.checked });
});

ui.langSelect.addEventListener('change', () => {
  chrome.storage.sync.set({ language: ui.langSelect.value });
});

ui.serverUrl.addEventListener('change', () => {
  const url = sanitizeUrl(ui.serverUrl.value);
  ui.serverUrl.value = url;
  chrome.storage.sync.set({ serverUrl: url });
});

ui.apiKey.addEventListener('change', () => {
  chrome.storage.sync.set({ apiKey: ui.apiKey.value.trim() });
});

ui.toggleKey.addEventListener('click', () => {
  ui.apiKey.type = ui.apiKey.type === 'password' ? 'text' : 'password';
});

ui.testBtn.addEventListener('click', () => {
  const url = sanitizeUrl(ui.serverUrl.value);
  ui.serverUrl.value = url;
  chrome.storage.sync.set({ serverUrl: url });
  verifyServer(url, ui.apiKey.value.trim());
});

// ─── Verificar conexión con el servidor ─────────────────────────────────
async function verifyServer(rawUrl, apiKey) {
  setStatus('checking');
  hideError();

  const url = sanitizeUrl(rawUrl) || 'http://localhost:8081';

  try {
    const res = await chrome.runtime.sendMessage({
      action: 'checkServerStatus',
      serverUrl: url,
      apiKey: apiKey || '',
    });

    if (res?.online) {
      let extra = '';
      if (res.hasEs) extra += ' · ES';
      if (res.hasEn) extra += ' · EN';
      setStatus('online', `Activo${extra} — ${res.total || '?'} idiomas`);
      hideError();
    } else {
      setStatus('offline', 'Servidor no disponible');
      showError(
        'No se puede conectar a LanguageTool.\n' +
        'Asegúrate de que el servidor esté corriendo en la URL indicada.'
      );
    }
  } catch {
    setStatus('offline', 'Error de conexión');
    showError('Ocurrió un error al intentar conectar con el servidor.');
  }
}

// ─── Estado visual ───────────────────────────────────────────────────────
function setStatus(state, text) {
  const dot  = ui.statusDot;
  const lbl  = ui.statusText;
  dot.className = 'status-dot';

  if (state === 'online') {
    dot.classList.add('dot-on');
    lbl.textContent = text || 'Servidor activo';
  } else if (state === 'offline') {
    dot.classList.add('dot-off');
    lbl.textContent = text || 'Servidor desconectado';
  } else {
    dot.classList.add('dot-wait');
    lbl.textContent = text || 'Verificando…';
  }
}

function showError(msg) {
  ui.errBanner.textContent = msg;
  ui.errBanner.style.display = 'block';
}
function hideError() {
  ui.errBanner.style.display = 'none';
}

// ─── Sanitizar URL ──────────────────────────────────────────────────────
function sanitizeUrl(raw) {
  const trimmed = (raw || '').trim().replace(/\/+$/, '');
  // Permitir localhost, 127.0.0.1 o HTTPS externo (cloud)
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(trimmed)) return trimmed;
  if (/^https:\/\/.{3,}/.test(trimmed)) return trimmed;
  return 'http://localhost:8081';
}
