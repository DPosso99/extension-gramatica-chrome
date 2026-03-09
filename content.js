// content.js — Inyectado en todas las páginas
// Detecta textareas y elementos contenteditable, los revisa con LanguageTool
// y muestra subrayados de error con sugerencias en tooltip.

(function () {
  'use strict';

  // ─── Constantes ───────────────────────────────────────────────────────────
  const DEBOUNCE_MS = 900;       // Espera tras dejar de escribir
  const MIN_LENGTH  = 10;        // Caracteres mínimos para revisar

  // Propiedades CSS que se copian al overlay para que el texto quede alineado
  const COPY_STYLES = [
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant',
    'letterSpacing', 'wordSpacing', 'lineHeight', 'textIndent', 'textTransform',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'boxSizing', 'tabSize', 'wordBreak', 'overflowWrap', 'direction',
  ];

  // ─── Configuración dinámica ──────────────────────────────────────────────
  let cfg = { enabled: true, language: 'auto', serverUrl: 'http://localhost:8081', apiKey: '' };

  function loadCfg() {
    return new Promise(resolve =>
      chrome.storage.sync.get(['enabled', 'language', 'serverUrl', 'apiKey'], data => {
        cfg = { ...cfg, ...data };
        resolve();
      })
    );
  }

  chrome.storage.onChanged.addListener(changes => {
    for (const [k, v] of Object.entries(changes)) cfg[k] = v.newValue;
    if ('enabled' in changes && !changes.enabled.newValue) clearAllHighlights();
    // Cuando cambia el idioma, relanzar revisión en todos los checkers activos
    if ('language' in changes) {
      document.querySelectorAll('textarea, [contenteditable="true"]').forEach(el => {
        const checker = checkers.get(el);
        if (checker) { checker.clear(); checker._schedule(); }
      });
    }
  });

  // ─── Utilidades HTML seguras ─────────────────────────────────────────────
  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
  function escAttr(str) {
    return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ─── Comunicación con el background ─────────────────────────────────────
  async function checkText(text) {
    if (!cfg.enabled) return null;
    const msg = { action: 'checkText', text, language: cfg.language, serverUrl: cfg.serverUrl, apiKey: cfg.apiKey };
    // Reintentar una vez si el SW estaba dormido y acaba de despertar
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await chrome.runtime.sendMessage(msg);
      } catch {
        if (attempt === 0) await new Promise(r => setTimeout(r, 600));
      }
    }
    return null;
  }

  // ─── Clase CSS según categoría de error ─────────────────────────────────
  function errorClass(match) {
    const cat = match.rule?.category?.id || '';
    if (cat === 'TYPOS' || cat === 'SPELLING')                   return 'gc-spelling';
    if (cat === 'STYLE' || cat === 'REDUNDANCY' ||
        cat === 'COLLOQUIALISMS')                                 return 'gc-style';
    if (cat === 'PUNCTUATION')                                    return 'gc-punctuation';
    return 'gc-grammar';
  }

  // ─── Tooltip ─────────────────────────────────────────────────────────────
  let tooltipEl, tooltipHideTimer;

  function buildTooltip() {
    tooltipEl = document.createElement('div');
    tooltipEl.id = 'gramchecker-tooltip';
    tooltipEl.className = 'gramchecker-tooltip';
    document.documentElement.appendChild(tooltipEl);
    tooltipEl.addEventListener('mouseenter', () => clearTimeout(tooltipHideTimer));
    tooltipEl.addEventListener('mouseleave', scheduleHide);
  }

  function showTooltip(rect, match, onApply) {
    clearTimeout(tooltipHideTimer);

    let html = '';
    if (match.shortMessage)
      html += `<div class="gc-ttip-title">${escHtml(match.shortMessage)}</div>`;
    html += `<div class="gc-ttip-msg">${escHtml(match.message)}</div>`;

    const reps = match.replacements?.slice(0, 6) || [];
    if (reps.length) {
      html += '<div class="gc-ttip-sug">';
      reps.forEach(r =>
        html += `<button class="gc-sug" data-val="${escAttr(r.value)}">${escHtml(r.value)}</button>`
      );
      html += '</div>';
    }

    const catName = match.rule?.category?.name;
    if (catName) html += `<div class="gc-ttip-cat">${escHtml(catName)}</div>`;

    tooltipEl.innerHTML = html;
    tooltipEl.style.display = 'block';

    // Posicionar
    const sx = window.scrollX, sy = window.scrollY, vw = window.innerWidth;
    tooltipEl.style.top = '-9999px';
    tooltipEl.style.left = '0';
    const tw = tooltipEl.offsetWidth;
    let left = rect.left + sx;
    let top  = rect.bottom + sy + 6;
    if (left + tw > sx + vw - 10) left = sx + vw - tw - 10;
    if (left < sx + 5)             left = sx + 5;
    tooltipEl.style.left = left + 'px';
    tooltipEl.style.top  = top  + 'px';

    // Sugerencias
    tooltipEl.querySelectorAll('.gc-sug').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        onApply(btn.dataset.val);
        hideTooltip();
      });
    });
  }

  function scheduleHide() {
    tooltipHideTimer = setTimeout(hideTooltip, 200);
  }
  function hideTooltip() {
    if (tooltipEl) tooltipEl.style.display = 'none';
  }

  // ════════════════════════════════════════════════════════════════════════════
  // TextareaChecker — overlay transparente sobre <textarea>
  // ════════════════════════════════════════════════════════════════════════════
  class TextareaChecker {
    constructor(el) {
      this.el       = el;
      this.overlay  = null;
      this.matches  = [];
      this.timer    = null;
      this._setup();
    }

    _setup() {
      const el = this.el;
      const cs = window.getComputedStyle(el);

      // Envolver en contenedor relativo sin romper el flujo
      const wrapper = document.createElement('div');
      wrapper.className = 'gc-wrapper';
      wrapper.style.cssText = [
        `display:${cs.display === 'inline' ? 'inline-block' : cs.display}`,
        `position:relative`,
        `margin:${cs.margin}`,
        `verticalAlign:${cs.verticalAlign}`,
      ].join(';');

      // Limpiar margen del textarea para que no se duplique
      el.style.margin = '0';

      el.parentNode.insertBefore(wrapper, el);
      wrapper.appendChild(el);

      // Overlay
      const overlay = document.createElement('div');
      overlay.className = 'gc-overlay';
      wrapper.appendChild(overlay);
      this.overlay = overlay;

      this._syncStyles();

      el.addEventListener('input',  () => this._schedule());
      el.addEventListener('focus',  () => this._schedule());
      el.addEventListener('scroll', () => this._syncScroll());

      new ResizeObserver(() => this._syncStyles()).observe(el);

      if (el.value.trim().length >= MIN_LENGTH) this._schedule();
    }

    _syncStyles() {
      const el  = this.el;
      const ov  = this.overlay;
      const cs  = window.getComputedStyle(el);

      COPY_STYLES.forEach(p => { ov.style[p] = cs[p]; });

      ov.style.position      = 'absolute';
      ov.style.top           = '0';
      ov.style.left          = '0';
      ov.style.width         = el.offsetWidth  + 'px';
      ov.style.height        = el.offsetHeight + 'px';
      ov.style.pointerEvents = 'none';
      ov.style.overflow      = 'hidden';
      ov.style.background    = 'transparent';
      ov.style.color         = 'transparent';
      // Borde transparente (para que el padding interno sea idéntico)
      ov.style.border        = `${cs.borderTopWidth} solid transparent`;
      ov.style.margin        = '0';
      ov.style.whiteSpace    = 'pre-wrap';
      ov.style.wordWrap      = 'break-word';
      ov.style.zIndex        = '1';
    }

    _syncScroll() {
      this.overlay.scrollTop  = this.el.scrollTop;
      this.overlay.scrollLeft = this.el.scrollLeft;
    }

    _schedule() {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this._run(), DEBOUNCE_MS);
    }

    async _run() {
      const text = this.el.value;
      if (text.trim().length < MIN_LENGTH) { this.clear(); return; }

      const result = await checkText(text);
      if (!result?.matches) return;

      this.matches = result.matches;
      this._render(text);
    }

    _render(text) {
      const sorted = [...this.matches].sort((a, b) => a.offset - b.offset);
      let html = '', cursor = 0;

      for (const m of sorted) {
        if (m.offset < cursor || m.offset >= text.length) continue;
        const end = Math.min(m.offset + m.length, text.length);

        html += escHtml(text.slice(cursor, m.offset));
        html += `<mark class="gc-mark ${errorClass(m)}" data-off="${m.offset}">${escHtml(text.slice(m.offset, end))}</mark>`;
        cursor = end;
      }
      html += escHtml(text.slice(cursor));

      this.overlay.innerHTML = html;

      // Activar hover en las marcas
      this.overlay.querySelectorAll('.gc-mark').forEach(mark => {
        mark.style.pointerEvents = 'auto';
        const off = parseInt(mark.dataset.off, 10);
        const match = sorted.find(m => m.offset === off);
        if (!match) return;

        mark.addEventListener('mouseenter', () =>
          showTooltip(mark.getBoundingClientRect(), match, val => this._apply(match, val))
        );
        mark.addEventListener('mouseleave', scheduleHide);
      });

      this._syncScroll();
    }

    _apply(match, suggestion) {
      const el   = this.el;
      const text = el.value;
      el.value   = text.slice(0, match.offset) + suggestion + text.slice(match.offset + match.length);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      this._schedule();
    }

    clear() {
      this.matches = [];
      if (this.overlay) this.overlay.innerHTML = '';
    }

    destroy() {
      clearTimeout(this.timer);
      this.clear();
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // ContentEditableChecker — usa CSS Custom Highlight API
  // ════════════════════════════════════════════════════════════════════════════
  class ContentEditableChecker {
    constructor(el) {
      this.el      = el;
      this.matches = [];
      this.timer   = null;
      this._setup();
    }

    _setup() {
      this.el.addEventListener('input',     () => this._schedule());
      this.el.addEventListener('focus',     () => this._schedule());
      this.el.addEventListener('mousemove', (e) => this._onHover(e));
      this.el.addEventListener('mouseleave', scheduleHide);
      if (this.el.textContent.trim().length >= MIN_LENGTH) this._schedule();
    }

    _schedule() {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this._run(), DEBOUNCE_MS);
    }

    async _run() {
      const text = this.el.innerText;
      if (text.trim().length < MIN_LENGTH) { this.clear(); return; }

      const result = await checkText(text);
      if (!result?.matches) return;

      this.matches = result.matches;
      this._applyHighlights(text);
    }

    _applyHighlights(text) {
      if (!CSS.highlights) return; // Chrome 105+

      CSS.highlights.delete('gc-spelling');
      CSS.highlights.delete('gc-grammar');
      CSS.highlights.delete('gc-style');
      CSS.highlights.delete('gc-punctuation');

      const charMap = this._buildCharMap();
      this._charMap = charMap;
      const buckets = { 'gc-spelling': [], 'gc-grammar': [], 'gc-style': [], 'gc-punctuation': [] };

      for (const m of this.matches) {
        const start = m.offset;
        const end   = m.offset + m.length - 1;
        if (start >= charMap.length || end >= charMap.length || end < start) continue;

        const range = new Range();
        range.setStart(charMap[start].node, charMap[start].off);
        range.setEnd(charMap[end].node, charMap[end].off + 1);

        const cls = errorClass(m);
        if (buckets[cls]) buckets[cls].push(range);
      }

      for (const [key, ranges] of Object.entries(buckets)) {
        if (ranges.length) CSS.highlights.set(key, new Highlight(...ranges));
      }
    }

    _buildCharMap() {
      const map    = [];
      const walker = document.createTreeWalker(this.el, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        for (let i = 0; i < node.length; i++) map.push({ node, off: i });
      }
      return map;
    }

    _getCharOffset(targetNode, targetOff) {
      const walker = document.createTreeWalker(this.el, NodeFilter.SHOW_TEXT);
      let total = 0, node;
      while ((node = walker.nextNode())) {
        if (node === targetNode) return total + targetOff;
        total += node.length;
      }
      return -1;
    }

    _onHover(e) {
      if (!this.matches.length || !this._charMap) return;

      let caretRange;
      if (document.caretRangeFromPoint) {
        caretRange = document.caretRangeFromPoint(e.clientX, e.clientY);
      } else if (document.caretPositionFromPoint) {
        const pos = document.caretPositionFromPoint(e.clientX, e.clientY);
        if (!pos) return;
        caretRange = document.createRange();
        caretRange.setStart(pos.offsetNode, pos.offset);
      }
      if (!caretRange) { scheduleHide(); return; }

      const charOff = this._getCharOffset(caretRange.startContainer, caretRange.startOffset);
      if (charOff < 0) { scheduleHide(); return; }

      const match = this.matches.find(m => charOff >= m.offset && charOff < m.offset + m.length);

      if (match) {
        clearTimeout(tooltipHideTimer);
        const map = this._charMap;
        const si = match.offset, ei = match.offset + match.length - 1;
        if (si < map.length && ei < map.length) {
          const r = new Range();
          r.setStart(map[si].node, map[si].off);
          r.setEnd(map[ei].node, map[ei].off + 1);
          const rect = r.getBoundingClientRect();
          if (rect.width > 0) showTooltip(rect, match, val => this._apply(match, val));
        }
      } else {
        scheduleHide();
      }
    }

    _apply(match, suggestion) {
      const map = this._charMap;
      if (!map || match.offset >= map.length) return;
      const si = match.offset, ei = match.offset + match.length - 1;
      if (ei >= map.length) return;

      const r = new Range();
      r.setStart(map[si].node, map[si].off);
      r.setEnd(map[ei].node, map[ei].off + 1);
      r.deleteContents();
      r.insertNode(document.createTextNode(suggestion));
      this.el.normalize();
      this.el.dispatchEvent(new Event('input', { bubbles: true }));
      this._schedule();
    }

    clear() {
      this.matches = [];
      this._charMap = null;
      CSS.highlights?.delete('gc-spelling');
      CSS.highlights?.delete('gc-grammar');
      CSS.highlights?.delete('gc-style');
      CSS.highlights?.delete('gc-punctuation');
    }

    destroy() {
      clearTimeout(this.timer);
      this.clear();
    }
  }

  // ─── Limpia todos los highlights de la página ────────────────────────────
  function clearAllHighlights() {
    document.querySelectorAll('.gc-overlay').forEach(o => (o.innerHTML = ''));
    CSS.highlights?.delete('gc-spelling');
    CSS.highlights?.delete('gc-grammar');
    CSS.highlights?.delete('gc-style');
    CSS.highlights?.delete('gc-punctuation');
  }

  // ─── Registro de revisores activos ──────────────────────────────────────
  const checkers = new WeakMap();

  function attach(el) {
    if (checkers.has(el)) return;

    if (el.tagName === 'TEXTAREA') {
      checkers.set(el, new TextareaChecker(el));
    } else if (el.contentEditable === 'true' && el.tagName !== 'INPUT') {
      checkers.set(el, new ContentEditableChecker(el));
    }
  }

  function scan(root) {
    root.querySelectorAll('textarea, [contenteditable="true"]').forEach(attach);
  }

  // ─── Inicialización ──────────────────────────────────────────────────────
  async function init() {
    await loadCfg();
    if (!cfg.enabled) return;

    buildTooltip();
    scan(document.body);

    new MutationObserver(mutations => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          attach(node);
          scan(node);
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
