// background.js — Service Worker (Manifest V3)
// Comunica con el servidor LanguageTool en localhost

'use strict';

// ─── Mantener el Service Worker vivo (MV3 lo duerme tras 30s) ───────────────
chrome.alarms.create('keepAlive', { periodInMinutes: 0.45 }); // cada ~27 segundos
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'keepAlive') {
    // Leer storage fuerza al SW a mantenerse activo
    chrome.storage.sync.get('enabled', () => {});
  }
});

// ─── Al arrancar Chrome o despertar, notificar a todas las pestañas abiertas ─────
async function notifyAllTabs() {
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, { action: 'reinit' }).catch(() => {});
  }
}

chrome.runtime.onStartup.addListener(notifyAllTabs);
chrome.runtime.onInstalled.addListener(notifyAllTabs);

// ─── Caché de resultados para no repetir peticiones idénticas ───────────────
const cache = new Map();
const CACHE_MAX = 100;

function simpleHash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash; // convertir a 32-bit
  }
  return Math.abs(hash).toString(36);
}

function cacheKey(text, language) {
  return `${language}::${simpleHash(text)}`;
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
  const lang = (() => {
    const l = language || 'auto';
    if (l === 'auto') return 'auto';
    // LanguageTool local solo soporta: es, es-AR, es-ES
    // Si el usuario elige es-CO u otra variante, usar 'es' (español generico)
    if (l.startsWith('es-') && l !== 'es-AR' && l !== 'es-ES') return 'es';
    return l;
  })();

  // Caché
  const key = cacheKey(text, lang);
  if (cache.has(key)) {
    return cache.get(key);
  }

  const body = new URLSearchParams({
    text,
    language: lang,
    level: 'picky',
    enabledCategories: 'GRAMMAR,SPELLING,TYPOGRAPHY,PUNCTUATION,STYLE,REDUNDANCY,COLLOQUIALISMS,CASING,CONFUSED_WORDS',
    enabledOnly: 'false',
  });

  // Si está en auto-detección, dar pistas de idioma preferido (ES + EN)
  if (lang === 'auto') {
    body.set('preferredLanguages', 'es,en');
    body.set('preferredVariants', 'es-ES,en-US');
  }

  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  // Adjuntar API Key si está configurada (requerida para servidor en la nube)
  if (apiKey && apiKey.trim().length > 0) {
    headers['X-API-Key'] = apiKey.trim();
  }

  // Timeout adaptativo: más tiempo para textos largos
  const timeout = Math.min(text.length * 2 + 3000, 15000);

  const response = await fetch(`${base}/v2/check`, {
    method: 'POST',
    headers,
    body: body.toString(),
    signal: AbortSignal.timeout(timeout),
  });

  if (!response.ok) {
    throw new Error(`Error del servidor: ${response.status}${response.status === 503 ? ' (sobrecarga)' : ''}`);
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
    signal: AbortSignal.timeout(5000),
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
