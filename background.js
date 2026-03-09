// background.js — Service Worker (Manifest V3)
// Comunica con el servidor LanguageTool en localhost

'use strict';

// ─── Caché de resultados para no repetir peticiones idénticas ───────────────
const cache = new Map();
const CACHE_MAX = 100;

function cacheKey(text, language) {
  // Hash liviano: primeros 200 chars + longitud + idioma
  return `${language}::${text.length}::${text.slice(0, 200)}`;
}

function addToCache(key, value) {
  if (cache.size >= CACHE_MAX) {
    // Eliminar la entrada más antigua
    cache.delete(cache.keys().next().value);
  }
  cache.set(key, value);
}

// ─── Listener principal ─────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'checkText') {
    handleCheckText(message)
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message, matches: [] }));
    return true; // señal de respuesta asíncrona
  }

  if (message.action === 'checkServerStatus') {
    handleCheckStatus(message.serverUrl, message.apiKey)
      .then(sendResponse)
      .catch(() => sendResponse({ online: false }));
    return true;
  }
});

// ─── Llamada a LanguageTool /v2/check ───────────────────────────────────────
async function handleCheckText({ text, language, serverUrl, apiKey }) {
  if (!text || text.trim().length < 5) {
    return { matches: [] };
  }

  // Limpiar URL base
  const base = (serverUrl || 'http://localhost:8081').replace(/\/$/, '');
  const lang = language || 'auto';

  // Caché
  const key = cacheKey(text, lang);
  if (cache.has(key)) {
    return cache.get(key);
  }

  const body = new URLSearchParams({
    text,
    language: lang,
    // Activar todas las categorías disponibles adicionales
    enabledCategories: 'STYLE,REDUNDANCY,COLLOQUIALISMS,TYPOGRAPHY,PUNCTUATION',
    enabledOnly: 'false',
  });

  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  // Adjuntar API Key si está configurada (requerida para servidor en la nube)
  if (apiKey && apiKey.trim().length > 0) {
    headers['X-API-Key'] = apiKey.trim();
  }

  const response = await fetch(`${base}/v2/check`, {
    method: 'POST',
    headers,
    body: body.toString(),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Error del servidor: ${response.status}`);
  }

  const data = await response.json();
  addToCache(key, data);
  return data;
}

// ─── Verificar que el servidor esté activo ──────────────────────────────────
async function handleCheckStatus(serverUrl, apiKey) {
  const base = (serverUrl || 'http://localhost:8081').replace(/\/$/, '');

  const headers = {};
  if (apiKey && apiKey.trim().length > 0) {
    headers['X-API-Key'] = apiKey.trim();
  }

  const response = await fetch(`${base}/v2/languages`, {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(4000),
  });

  if (!response.ok) {
    return { online: false };
  }

  const languages = await response.json();
  // Verificar que soporte Español e Inglés
  const codes = languages.map(l => l.longCode || l.code);
  const hasEs = codes.some(c => c.startsWith('es'));
  const hasEn = codes.some(c => c.startsWith('en'));

  return { online: true, hasEs, hasEn, total: languages.length };
}
