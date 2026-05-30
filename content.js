// content.js — Inyectado en todas las páginas
// Detecta textareas y elementos contenteditable, los revisa con LanguageTool
// y muestra subrayados de error con sugerencias en tooltip.

(function () {
  'use strict';

  // ─── Constantes ───────────────────────────────────────────────────────────
  const DEBOUNCE_MS = 500;       // Espera tras dejar de escribir (reducido para mayor rapidez)
  const MIN_LENGTH  = 10;        // Caracteres mínimos para revisar

  // Delimitadores de palabra para auto-corrección
  const WORD_BOUNDARIES = [' ', '.', ',', '!', '?', ':', ';', '\n', '\r'];

  // Corrección instantánea para palabras obvias (sin esperar al servidor)
  const COMMON_TYPOS = {
    // Sin tilde en interrogativos / exclamativos
    'q': 'que',
    'k': 'que',
    'como': 'cómo',
    'cuando': 'cuándo',
    'donde': 'dónde',
    'que': 'qué',
    'quien': 'quién',
    'qien': 'quién',
    'quienes': 'quiénes',
    'cual': 'cuál',
    'cuales': 'cuáles',
    'cuanto': 'cuánto',
    'cuantos': 'cuántos',
    'cuanta': 'cuánta',
    'cuantas': 'cuántas',

    // Chat / abreviaturas
    'pq': 'porque',
    'xq': 'porque',
    'porq': 'porque',
    'xfa': 'por favor',
    'tmb': 'también',
    'tmbn': 'también',
    'tkm': 'te quiero mucho',
    'nvn': 'no vino',
    'bn': 'bien',
    'stas': 'estás',
    'tas': 'estás',
    'stoy': 'estoy',
    'cmo': 'cómo',
    'ola': 'hola',
    'klk': 'qué lo que',

    // Palabras sin tilde (agudas terminadas en n/s/vocal)
    'accion': 'acción',
    'cancion': 'canción',
    'corazon': 'corazón',
    'direccion': 'dirección',
    'educacion': 'educación',
    'informacion': 'información',
    'nacion': 'nación',
    'relacion': 'relación',
    'situacion': 'situación',
    'traduccion': 'traducción',
    'ocasion': 'ocasión',
    'solucion': 'solución',
    'poblacion': 'población',
    'generacion': 'generación',
    'atencion': 'atención',
    'opcion': 'opción',
    'produccion': 'producción',
    'seccion': 'sección',
    'construccion': 'construcción',
    'conexion': 'conexión',
    'cafe': 'café',
    'compas': 'compás',
    'jamas': 'jamás',
    'ingles': 'inglés',
    'frances': 'francés',
    'autobus': 'autobús',
    'dificil': 'difícil',
    'facil': 'fácil',
    'util': 'útil',
    'arbol': 'árbol',
    'lapiz': 'lápiz',
    'carcel': 'cárcel',
    'habil': 'hábil',
    'debil': 'débil',
    'futil': 'fútil',
    'mastil': 'mástil',

    // Interrogativos sin tilde
    'porke': 'porque',
    'comoestas': 'cómo estás',
    'qondas': 'qué ondas',

    // Verbos comunes sin tilde
    'esta': 'está',
    'estan': 'están',
    'dare': 'daré',
    'dire': 'diré',
    'hare': 'haré',
    'ire': 'iré',
    'sere': 'seré',
    'tendre': 'tendré',
    'vendre': 'vendré',
    'podre': 'podré',
    'querre': 'querré',
    'sabre': 'sabré',
    'saldre': 'saldré',
    'pondre': 'pondré',
    'hablo': 'habló',
    'hablaste': 'hablaste',
    'comio': 'comió',
    'vio': 'vió',
    'dio': 'dió',
    'fue': 'fué',
    'escucho': 'escuchó',
    'miro': 'miró',
    'paso': 'pasó',
    'dejo': 'dejó',
    'llego': 'llegó',

    // Imperfecto sin tilde
    'sabia': 'sabía',
    'tenia': 'tenía',
    'queria': 'quería',
    'podia': 'podía',
    'habia': 'había',
    'decia': 'decía',
    'hacia': 'hacía',
    'venia': 'venía',
    'ponia': 'ponía',
    'salia': 'salía',
    'traia': 'traía',
    'dormia': 'dormía',
    'sentia': 'sentía',
    'pedia': 'pedía',
    'seguia': 'seguía',
    'volvia': 'volvía',
    'corria': 'corría',
    'escribia': 'escribía',

    // Pronombres sin tilde
    'el': 'él',
    'tu': 'tú',
    'mi': 'mí',
    'si': 'sí',
    'se': 'sé',
    'de': 'dé',
    'te': 'té',
    'aun': 'aún',
    'mas': 'más',

    // Palabras compuestas / patrones
    'tambien': 'también',
    'adiós': 'adiós',
    'mama': 'mamá',
    'papa': 'papá',
    'telefono': 'teléfono',
    'microfono': 'micrófono',
    'gramatica': 'gramática',
    'ortografia': 'ortografía',
    'matematicas': 'matemáticas',
    'fisica': 'física',
    'quimica': 'química',
    'politica': 'política',
    'musica': 'música',
    'practica': 'práctica',
    'fabrica': 'fábrica',
    'medico': 'médico',
    'sabado': 'sábado',
    'miercoles': 'miércoles',

    // H faltante
    'acer': 'hacer',
    'aora': 'ahora',
    'asta': 'hasta',
    'abia': 'había',
    'ablar': 'hablar',
    'aci': 'hací',
    'ay': 'hay',
    'echo': 'hecho',
    'ermano': 'hermano',
    'istoria': 'historia',
    'ola': 'hola',
    'ueso': 'hueso',
    'uevo': 'huevo',
    'ablando': 'hablando',

    // Misceláneos
    'asi': 'así',
    'enserio': 'en serio',
    'osea': 'o sea',
    'atravez': 'a través',
    'aveces': 'a veces',
    'apesar': 'a pesar',
    'derrepente': 'de repente',
    'apenas': 'apenas',
    'haci': 'hací',
    'hay': 'hay',
    'aiga': 'haya',
    'dijistes': 'dijiste',
    'venistes': 'viniste',
    'hicistes': 'hiciste',
    'fuistes': 'fuiste',
    'pusistes': 'pusiste',
    'nadien': 'nadie',
    'naiden': 'nadie',
    'pecsi': 'Pepsi',
    'diferencia': 'diferencia',
  };

  // ─── Reglas de patrón para acentuación ──────────────────────────────────
  // Se aplican DESPUÉS del diccionario, como fallback para palabras no listadas.
  const ACCENT_RULES = [
    // -cion sin tilde -> -ción (muy fiable, falso positivo casi inexistente)
    { pattern: /^([a-záéíóúüñ]{3,})cion$/i, replacement: '$1ción' },
    // -sion sin tilde -> -sión
    { pattern: /^([a-záéíóúüñ]{2,})sion$/i, replacement: '$1sión' },
    // Verbos en -ia (imperfecto) sin tilde: sabia, tenia, queria, podia...
    { pattern: /^(sab|ten|quer|pod|hab|dec|hac|ven|pon|sal|tra|dorm|sent|ped|segu|volv|corr|escrib)ia$/i, replacement: '$1ía' },
    // Verbos en -re (futuro) sin tilde: dare, dire, hare, ire...
    { pattern: /^(da|di|ha|i|se|ten|ven|pod|quer|sab|sal|pon|dir|har|ser)re$/i, replacement: '$1ré' },
    // -mente sin tilde en la raiz: facilmente, rapidamente...
    { pattern: /^(facil|dificil|rapid|agil|util|habil|debil|futil|comod|practic)mente$/i, replacement: '$1mente' },
    // Adverbios terminados en -icamente: practicamente, basicamente...
    { pattern: /^([a-z]{3,})icamente$/i, replacement: '$1ícamente' },
  ];

  // Busca corrección: primero diccionario, luego reglas de patrón
  function findCorrection(word) {
    const lower = word.toLowerCase();
    if (COMMON_TYPOS[lower]) {
      let replacement = COMMON_TYPOS[lower];
      if (word[0] === word[0].toUpperCase()) {
        replacement = replacement.charAt(0).toUpperCase() + replacement.slice(1);
      }
      return replacement;
    }
    // Fallback: reglas de patrón (solo si la palabra tiene al menos 4 letras)
    if (lower.length >= 4) {
      for (const rule of ACCENT_RULES) {
        const m = lower.match(rule.pattern);
        if (m) {
          let replacement = lower.replace(rule.pattern, rule.replacement);
          if (word[0] === word[0].toUpperCase()) {
            replacement = replacement.charAt(0).toUpperCase() + replacement.slice(1);
          }
          return replacement;
        }
      }
    }
    return null;
  }

  // Propiedades CSS que se copian al overlay para que el texto quede alineado
  const COPY_STYLES = [
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant',
    'letterSpacing', 'wordSpacing', 'lineHeight', 'textIndent', 'textTransform',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'boxSizing', 'tabSize', 'wordBreak', 'overflowWrap', 'direction',
  ];

  // ─── Configuración dinámica ──────────────────────────────────────────────
  let cfg = { enabled: true, autoCorrect: false, language: 'es-CO', serverUrl: 'http://localhost:8081', apiKey: '' };

  function loadCfg() {
    return new Promise(resolve =>
      chrome.storage.sync.get(['enabled', 'autoCorrect', 'language', 'serverUrl', 'apiKey'], data => {
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

  // ─── Errores ignorados ───────────────────────────────────────────────────
  let ignoredRules = new Set();
  let ignoredWords = new Set();

  function loadIgnored() {
    return new Promise(resolve =>
      chrome.storage.local.get(['ignoredRules', 'ignoredWords'], data => {
        ignoredRules = new Set(data.ignoredRules || []);
        ignoredWords = new Set((data.ignoredWords || []).map(w => w.toLowerCase()));
        resolve();
      })
    );
  }

  function ignoreRule(ruleId) {
    ignoredRules.add(ruleId);
    chrome.storage.local.set({ ignoredRules: [...ignoredRules] });
    _refreshAllCheckers();
  }

  function ignoreWord(word) {
    ignoredWords.add(word.toLowerCase());
    chrome.storage.local.set({ ignoredWords: [...ignoredWords] });
    _refreshAllCheckers();
  }

  function isIgnored(match, text) {
    if (match.rule?.id && ignoredRules.has(match.rule.id)) return true;
    const word = text.slice(match.offset, match.offset + match.length).toLowerCase();
    return ignoredWords.has(word);
  }

  function _refreshAllCheckers() {
    document.querySelectorAll('textarea, [contenteditable="true"]').forEach(el => {
      const checker = checkers.get(el);
      if (checker) { checker.clear(); checker._schedule(); }
    });
  }

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

  // ─── Autocorrección instantánea compartida (Textarea) ───────────────────
  function instantCorrectTextarea(el, key) {
    const pos = el.selectionStart;
    const text = el.value;
    const boundaryIndex = pos - 1;
    if (boundaryIndex < 0 || text[boundaryIndex] !== key) return false;

    let wordStart = boundaryIndex;
    while (wordStart > 0 && !WORD_BOUNDARIES.includes(text[wordStart - 1])) {
      wordStart--;
    }

    if (wordStart < boundaryIndex) {
      const word = text.slice(wordStart, boundaryIndex);
      const replacement = findCorrection(word);
      if (replacement) {
        const before = text.slice(0, wordStart);
        const after = text.slice(boundaryIndex + 1);
        el.value = before + replacement + key + after;
        const newPos = before.length + replacement.length + 1;
        el.setSelectionRange(newPos, newPos);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }
    }
    return false;
  }

  // ─── Autocorrección instantánea compartida (ContentEditable) ────────────
  function instantCorrectEditable(el, key) {
    const sel = window.getSelection();
    if (!sel || !sel.isCollapsed || sel.rangeCount === 0) return false;

    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    const offset = range.startOffset;
    if (node.nodeType !== Node.TEXT_NODE) return false;

    const text = node.textContent;
    const boundaryIndex = offset - 1;
    if (boundaryIndex < 0 || text[boundaryIndex] !== key) return false;

    let wordStart = boundaryIndex;
    while (wordStart > 0 && !WORD_BOUNDARIES.includes(text[wordStart - 1])) {
      wordStart--;
    }

    if (wordStart < boundaryIndex) {
      const word = text.slice(wordStart, boundaryIndex);
      const replacement = findCorrection(word);
      if (replacement) {
        const r = document.createRange();
        r.setStart(node, wordStart);
        r.setEnd(node, boundaryIndex + 1);
        sel.removeAllRanges();
        sel.addRange(r);
        el.focus();
        document.execCommand('insertText', false, replacement + key);
        return true;
      }
    }
    return false;
  }

  // ─── Comunicación con el background ─────────────────────────────────────
  let _checkAbortController = null;

  async function checkText(text) {
    if (!cfg.enabled) return null;

    // Cancelar cualquier request anterior en vuelo
    if (_checkAbortController) {
      _checkAbortController.abort();
    }
    _checkAbortController = new AbortController();

    const msg = { action: 'checkText', text, language: cfg.language, serverUrl: cfg.serverUrl, apiKey: cfg.apiKey };
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await chrome.runtime.sendMessage(msg);
      } catch (err) {
        if (_checkAbortController.signal.aborted) return null;
        if (attempt === 0) await new Promise(r => setTimeout(r, 500));
      }
    }
    return null;
  }

  // ─── Escuchar reinit del SW (al arrancar Chrome o despertar el PC) ────────
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'reinit') {
      loadCfg().then(() => {
        if (!cfg.enabled) return;
        // Relanzar revisión en todos los elementos ya attachados
        document.querySelectorAll('textarea, [contenteditable="true"]').forEach(el => {
          const checker = checkers.get(el);
          if (checker) { checker.clear(); checker._schedule(); }
          else attach(el);
        });
        // Buscar nuevos elementos que quizás aún no estaban
        scan(document.body);
      });
    }
  });

  // ─── Clase CSS según categoría de error ─────────────────────────────────
  function errorClass(match) {
    const cat  = match.rule?.category?.id || '';
    const type = match.rule?.issueType || '';
    if (cat === 'TYPOS' || cat === 'SPELLING' || type === 'misspelling') return 'gc-spelling';
    if (cat === 'STYLE' || cat === 'REDUNDANCY' ||
        cat === 'COLLOQUIALISMS')                                         return 'gc-style';
    if (cat === 'PUNCTUATION')                                            return 'gc-punctuation';
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
    // Evitar que el clic en el tooltip robe el foco del editor
    tooltipEl.addEventListener('mousedown', e => e.preventDefault());
  }

  function showTooltip(rect, match, word, onApply, onIgnoreWord, onIgnoreRule) {
    clearTimeout(tooltipHideTimer);

    let html = '<button class="gc-close" title="Cerrar">&times;</button>';
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
    } else {
      html += '<div class="gc-ttip-empty">Sin sugerencias disponibles</div>';
    }

    const catName = match.rule?.category?.name;
    if (catName) html += `<div class="gc-ttip-cat">${escHtml(catName)}</div>`;

    // Acciones de ignorar
    html += '<div class="gc-ttip-ignore">';
    if (word) html += `<button class="gc-ignore-word">&times; Ignorar &ldquo;${escHtml(word)}&rdquo;</button>`;
    if (match.rule?.id) html += `<button class="gc-ignore-rule">&times; Ignorar esta regla siempre</button>`;
    html += '</div>';

    tooltipEl.innerHTML = html;
    tooltipEl.style.visibility = 'hidden';
    tooltipEl.style.display = 'block';

    // Posicionar: abajo si cabe, arriba si no
    const sx = window.scrollX, sy = window.scrollY;
    const vw = window.innerWidth, vh = window.innerHeight;
    const tw = tooltipEl.offsetWidth;
    const th = tooltipEl.offsetHeight;
    let left = rect.left + sx;
    if (left + tw > sx + vw - 10) left = sx + vw - tw - 10;
    if (left < sx + 5)             left = sx + 5;
    const spaceBelow = vh - (rect.top + sy);
    const top = spaceBelow >= th + 10
      ? rect.top + sy + 6          // hay espacio abajo
      : rect.top + sy - th - 6;    // no hay espacio: va arriba
    tooltipEl.style.left = left + 'px';
    tooltipEl.style.top  = top  + 'px';
    tooltipEl.style.visibility = 'visible';

    // Sugerencias
    tooltipEl.querySelectorAll('.gc-sug').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        onApply(btn.dataset.val);
        hideTooltip();
      });
    });

    // Ignorar esta palabra
    tooltipEl.querySelector('.gc-ignore-word')?.addEventListener('click', e => {
      e.stopPropagation();
      if (word) onIgnoreWord(word);
      hideTooltip();
    });

    // Ignorar esta regla
    tooltipEl.querySelector('.gc-ignore-rule')?.addEventListener('click', e => {
      e.stopPropagation();
      if (match.rule?.id) onIgnoreRule(match.rule.id);
      hideTooltip();
    });

    // Botón de cerrar (X)
    tooltipEl.querySelector('.gc-close')?.addEventListener('click', e => {
      e.stopPropagation();
      hideTooltip();
    });
  }

  function scheduleHide() {
    clearTimeout(tooltipHideTimer);
    tooltipHideTimer = setTimeout(hideTooltip, 600);
  }
  function hideTooltip() {
    if (tooltipEl) tooltipEl.style.display = 'none';
  }

  // Tecla Escape para cerrar tooltip
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      hideTooltip();
    }
  });

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

      // El overlay se añade al body con position:fixed para no alterar
      // el DOM de la página (evita romper layouts como la búsqueda de Google)
      const overlay = document.createElement('div');
      overlay.className = 'gc-overlay';
      (document.body || document.documentElement).appendChild(overlay);
      this.overlay = overlay;

      this._syncStyles();

      this._onWinScroll = () => this._syncPos();
      window.addEventListener('scroll', this._onWinScroll, { passive: true, capture: true });

      el.addEventListener('input',  () => this._schedule());
      el.addEventListener('focus',  () => { this._syncPos(); this._schedule(); });
      el.addEventListener('scroll', () => this._syncScroll());
      el.addEventListener('keyup',  (e) => this._onKey(e));

      new ResizeObserver(() => this._syncStyles()).observe(el);

      if (el.value.trim().length >= MIN_LENGTH) this._schedule();
    }

    _syncStyles() {
      const el = this.el;
      const ov = this.overlay;
      const cs = window.getComputedStyle(el);

      COPY_STYLES.forEach(p => { ov.style[p] = cs[p]; });

      const rect = el.getBoundingClientRect();
      ov.style.position      = 'fixed';
      ov.style.top           = rect.top  + 'px';
      ov.style.left          = rect.left + 'px';
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
      ov.style.zIndex        = '2147483647';
    }

    _syncPos() {
      const rect = this.el.getBoundingClientRect();
      this.overlay.style.top  = rect.top  + 'px';
      this.overlay.style.left = rect.left + 'px';
    }

    _syncScroll() {
      this.overlay.scrollTop  = this.el.scrollTop;
      this.overlay.scrollLeft = this.el.scrollLeft;
      this._syncPos();
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
      const sorted = [...this.matches]
        .filter(m => !isIgnored(m, text))
        .sort((a, b) => a.offset - b.offset);
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

        const word = text.slice(match.offset, match.offset + match.length);
        const doShow = () =>
          showTooltip(mark.getBoundingClientRect(), match, word,
            val => this._apply(match, val),
            w   => ignoreWord(w),
            rid => ignoreRule(rid));
        mark.addEventListener('mouseenter', doShow);
        mark.addEventListener('click',      doShow);
        mark.addEventListener('mouseleave', scheduleHide);
      });

      this._syncScroll();
    }

    _apply(match, suggestion) {
      const el   = this.el;
      // Obtener el valor ACTÚAL del textarea, no confiar en el texto viejo
      const text = el.value;
      
      this.clear();
      hideTooltip();
      
      // Asegurarnos que no estamos reemplazando fuera de límites
      if (match.offset > text.length) return;
      
      el.value   = text.slice(0, match.offset) + suggestion + text.slice(match.offset + match.length);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      this._schedule();
    }

    _onKey(e) {
      if (!cfg.autoCorrect) return;
      if (!WORD_BOUNDARIES.includes(e.key)) return;

      if (instantCorrectTextarea(this.el, e.key)) {
        this._schedule();
        return;
      }

      if (!this.matches.length) return;

      const cursorPos = this.el.selectionStart;
      // Buscar el último error ortográfico que terminó justo antes del cursor
      const candidates = this.matches
        .filter(m =>
          errorClass(m) === 'gc-spelling' &&
          m.replacements?.length > 0 &&
          m.offset + m.length < cursorPos
        )
        .sort((a, b) => (b.offset + b.length) - (a.offset + a.length));

      if (!candidates.length) return;
      const m = candidates[0];
      // Solo corregir la última palabra completada (debe terminar cerca del cursor)
      if (cursorPos - (m.offset + m.length) > 2) return;
      this._apply(m, m.replacements[0].value);
    }

    clear() {
      this.matches = [];
      if (this.overlay) this.overlay.innerHTML = '';
    }

    destroy() {
      clearTimeout(this.timer);
      this.clear();
      if (this._onWinScroll) window.removeEventListener('scroll', this._onWinScroll, { capture: true });
      if (this.overlay?.parentNode) this.overlay.parentNode.removeChild(this.overlay);
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
      this.el.addEventListener('click',     (e) => this._onHover(e));
      this.el.addEventListener('mouseleave', scheduleHide);
      this.el.addEventListener('keyup',     (e) => this._onKey(e));
      if (this.el.textContent.trim().length >= MIN_LENGTH) this._schedule();
    }

    _schedule() {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this._run(), DEBOUNCE_MS);
    }

    // Construye el texto plano y el mapa de caracteres en un único recorrido.
    // Inserta '\n' entre elementos bloque para que palabras de párrafos distintos
    // no se fusionen (p.ej. "lista" + "para" → "listapara").
    _buildTextAndMap() {
      const BLOCK = new Set(['P','DIV','LI','H1','H2','H3','H4','H5','H6',
        'BLOCKQUOTE','TD','TH','TR','PRE','SECTION','ARTICLE','ASIDE','HEADER','FOOTER','MAIN']);
      const map = [];
      let text = '';

      const ensureNewline = () => {
        if (text.length && text[text.length - 1] !== '\n') {
          map.push(null); // carácter virtual, sin posición real en el DOM
          text += '\n';
        }
      };

      const walk = (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          for (let i = 0; i < node.length; i++) {
            map.push({ node, off: i });
            text += node.textContent[i];
          }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          // IGNORAR firmas de Gmail y correos anteriores citados para evitar cuellos de botella y desincronización
          if (node.classList && (node.classList.contains('gmail_quote') || node.classList.contains('gmail_signature'))) {
            return;
          }

          if (node.tagName === 'BR') { ensureNewline(); return; }
          const isBlock = BLOCK.has(node.tagName);
          if (isBlock) ensureNewline();
          for (const child of node.childNodes) walk(child);
          if (isBlock) ensureNewline();
        }
      };

      for (const child of this.el.childNodes) walk(child);
      return { text, map };
    }

    async _run() {
      const { text, map } = this._buildTextAndMap();
      this._charMap  = map;
      this._lastText = text;
      if (text.trim().length < MIN_LENGTH) { this.clear(); return; }

      const result = await checkText(text);
      if (!result?.matches) return;

      this.matches = result.matches;
      this._applyHighlights();
    }

    _applyHighlights() {
      if (!CSS.highlights) return; // Chrome 105+

      CSS.highlights.delete('gc-spelling');
      CSS.highlights.delete('gc-grammar');
      CSS.highlights.delete('gc-style');
      CSS.highlights.delete('gc-punctuation');

      const charMap = this._charMap;
      if (!charMap) return;
      const text = this._lastText || '';
      const buckets = { 'gc-spelling': [], 'gc-grammar': [], 'gc-style': [], 'gc-punctuation': [] };

      for (const m of this.matches) {
        if (isIgnored(m, text)) continue;
        const start = m.offset;
        const end   = m.offset + m.length - 1;
        if (start >= charMap.length || end >= charMap.length || end < start) continue;

        const se = charMap[start], ee = charMap[end];
        if (!se || !ee) continue; // carácter virtual (salto de línea insertado)

        try {
          const range = new Range();
          range.setStart(se.node, se.off);
          range.setEnd(ee.node, ee.off + 1);
          const cls = errorClass(m);
          if (buckets[cls]) buckets[cls].push(range);
        } catch { /* el DOM cambió */ }
      }

      for (const [key, ranges] of Object.entries(buckets)) {
        if (ranges.length) CSS.highlights.set(key, new Highlight(...ranges));
      }
    }

    _getCharOffset(targetNode, targetOff) {
      if (!this._charMap) return -1;
      for (let i = 0; i < this._charMap.length; i++) {
        const e = this._charMap[i];
        if (e && e.node === targetNode && e.off === targetOff) return i;
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

      const text  = this._lastText || '';
      // Buscar un match en un radio de ±2 caracteres para facilitar la selección
      const match = this.matches.find(m =>
        !isIgnored(m, text) && charOff >= m.offset - 2 && charOff < m.offset + m.length + 2);

      if (match) {
        clearTimeout(tooltipHideTimer);
        const map = this._charMap;
        const si = match.offset, ei = match.offset + match.length - 1;
        if (si < map.length && ei < map.length) {
          const se = map[si], ee = map[ei];
          if (!se || !ee) { scheduleHide(); return; } // carácter virtual
          try {
            const r = new Range();
            // Validar que los offsets son aún válidos (el DOM puede haber cambiado)
            if (se.off > se.node.length || ee.off + 1 > ee.node.length) {
              this._schedule(); // recomputar mapa
              return;
            }
            r.setStart(se.node, se.off);
            r.setEnd(ee.node, ee.off + 1);
            const rect = r.getBoundingClientRect();
            const word = text.slice(match.offset, match.offset + match.length);
            if (rect.width > 0) showTooltip(rect, match, word,
              val => this._apply(match, val),
              w   => ignoreWord(w),
              rid => ignoreRule(rid));
          } catch {
            // El DOM cambió desde que se computó el charMap; recomputar
            this._schedule();
          }
        }
      } else {
        scheduleHide();
      }
    }

    _onKey(e) {
      if (!cfg.autoCorrect) return;
      if (!WORD_BOUNDARIES.includes(e.key)) return;

      if (instantCorrectEditable(this.el, e.key)) {
        this._schedule();
        return;
      }

      if (!this.matches.length) return;

      // Obtener offset del cursor en el texto plano
      let cursorPos = -1;
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        cursorPos = this._getCharOffset(range.startContainer, range.startOffset);
      }
      if (cursorPos < 0) return;

      const candidates = this.matches
        .filter(m =>
          errorClass(m) === 'gc-spelling' &&
          m.replacements?.length > 0 &&
          m.offset + m.length < cursorPos
        )
        .sort((a, b) => (b.offset + b.length) - (a.offset + a.length));

      if (!candidates.length) return;
      const m = candidates[0];
      if (cursorPos - (m.offset + m.length) > 2) return;
      this._apply(m, m.replacements[0].value);
    }

    _apply(match, suggestion) {
      // Reconstruir el mapa antes de intentar, para tener offsets frescos
      const { text: freshText, map: freshMap } = this._buildTextAndMap();
      if (!freshMap || match.offset >= freshMap.length) {
        this.clear();
        hideTooltip();
        this._schedule();
        return;
      }

      const si = match.offset;
      const ei = match.offset + match.length - 1;
      if (ei >= freshMap.length) {
        this.clear();
        hideTooltip();
        this._schedule();
        return;
      }

      const startEntry = freshMap[si];
      const endEntry   = freshMap[ei];
      if (!startEntry || !endEntry) {
        this.clear();
        hideTooltip();
        this._schedule();
        return;
      }

      this.clear();
      hideTooltip();

      try {
        const startNode = startEntry.node;
        const startOff  = startEntry.off;
        const endNode   = endEntry.node;
        const endOff    = endEntry.off + 1;

        if (startOff > startNode.length || endOff > endNode.length) {
          this._schedule();
          return;
        }

        // Recuperar foco para que execCommand no falle o se aplique en el aire
        this.el.focus();
        const sel = window.getSelection();

        // Estrategia: seleccionar el texto incorrecto e insertar la correccion (reemplaza)
        const r1 = document.createRange();
        r1.setStart(startNode, startOff);
        r1.setEnd(endNode, endOff);
        if (sel) { sel.removeAllRanges(); sel.addRange(r1); }

        // Verificar que lo seleccionado coincide con lo que queremos corregir
        const selText = sel ? sel.toString() : r1.toString();
        const expected = freshText.slice(match.offset, match.offset + match.length);

        if (selText === expected || selText.toLowerCase() === expected.toLowerCase()) {
          // Reemplazar la selección atómicamente
          document.execCommand('insertText', false, suggestion);
        } else if (selText.length > 0) {
          // Intentar con lo que está seleccionado (puede ser Gmail que redistribuyó el DOM)
          document.execCommand('insertText', false, suggestion);
        } else {
          // No se pudo seleccionar nada, reescanear
          this._schedule();
          return;
        }
      } catch {
        // Ultimo recurso: no usar textContent (destruye HTML de editores)
        this._schedule();
      }

      this._schedule();
    }

    clear() {
      this.matches = [];
      this._charMap  = null;
      this._lastText = null;
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
    await Promise.all([loadCfg(), loadIgnored()]);
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

    // Catch dinámico para editores que cambian contenteditable después de insertados (ej. Gmail)
    document.addEventListener('focusin', e => {
      const el = e.target;
      if (el && el.nodeType === Node.ELEMENT_NODE) {
        if (el.tagName === 'TEXTAREA' || el.contentEditable === 'true') {
          attach(el);
        }
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
