# Gmail Long-Text Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mejorar la precisión y rendimiento en Gmail para textos largos con muchos errores, y mostrar un estado claro cuando no hay sugerencias.

**Architecture:** En `content.js`, detectar Gmail y activar reglas especiales: filtrar bloques citados/firmas, limitar el tamaño del texto analizado y aplicar un fallback con fragmento más pequeño. En `background.js`, aceptar un modo de reintento si el texto es demasiado largo. En el tooltip, mostrar un mensaje cuando no existen replacements.

**Tech Stack:** Chrome Extension (Manifest V3), JavaScript, LanguageTool local, CSS.

---

## File Structure

- **Modify** `content.js`
  - Detectar Gmail automáticamente.
  - Filtrar contenido irrelevante (citas/firmas).
  - Limitar el texto analizado en Gmail.
  - Fallback por fragmento cuando hay timeout o respuesta nula.
  - Mostrar estado "Sin sugerencias".
- **Modify** `content.css`
  - Estilo para el mensaje “Sin sugerencias”.
- **Modify** `background.js`
  - Añadir soporte opcional de "fragment" en la request (cuando el content envía un fragmento más corto).

---

### Task 1: Gmail detection + content filtering

**Files:**
- Modify: `content.js`

- [ ] **Step 1: Write the failing test**

No hay suite de tests; usar verificación manual.

- [ ] **Step 2: Implement Gmail detection**

Add near the top of `content.js` (after constants):

```js
  const IS_GMAIL = location.hostname === 'mail.google.com';
```

- [ ] **Step 3: Expand Gmail filtering in _buildTextAndMap**

Replace the Gmail filter block in `_buildTextAndMap()` with:

```js
          if (node.classList) {
            if (
              node.classList.contains('gmail_quote') ||
              node.classList.contains('gmail_signature') ||
              node.classList.contains('gmail_extra') ||
              node.classList.contains('gmail_attr')
            ) {
              return;
            }
          }

          if (node.tagName === 'BLOCKQUOTE' && IS_GMAIL) {
            return;
          }
```

- [ ] **Step 4: Manual verification**

Open Gmail and ensure:
- Escribir un correo largo sigue mostrando subrayados.
- El texto citado anterior no se analiza.

- [ ] **Step 5: Commit**

```bash
git add content.js
git commit -m "fix(gmail): filter quoted blocks and signatures" 
```

---

### Task 2: Gmail long-text limits + fallback

**Files:**
- Modify: `content.js`

- [ ] **Step 1: Write the failing test**

No hay suite de tests; usar verificación manual.

- [ ] **Step 2: Add Gmail limits constants**

Add near constants:

```js
  const GMAIL_MAX_CHARS = 10000;
  const GMAIL_FALLBACK_CHARS = 4500;
```

- [ ] **Step 3: Trim text in ContentEditableChecker _run**

Update `_run()` in `ContentEditableChecker` before calling `checkText(text)`:

```js
      let runText = text;
      if (IS_GMAIL && text.length > GMAIL_MAX_CHARS) {
        runText = text.slice(-GMAIL_MAX_CHARS);
        this._gmailOffsetBase = text.length - runText.length;
      } else {
        this._gmailOffsetBase = 0;
      }

      const result = await checkText(runText);
```

- [ ] **Step 4: Offset correction in _applyHighlights and _onHover**

Adjust matches with offset base before using:

```js
      const base = this._gmailOffsetBase || 0;
      for (const m of this.matches) {
        const start = m.offset + base;
        const end = start + m.length - 1;
```

Also in `_onHover`, when slicing word:

```js
      const base = this._gmailOffsetBase || 0;
      const word = text.slice(match.offset + base, match.offset + base + match.length);
```

- [ ] **Step 5: Fallback retry if no response**

Update `checkText` in `content.js`:

```js
  async function checkText(text, options = {}) {
    if (!cfg.enabled) return null;
    const msg = { action: 'checkText', text, language: cfg.language, serverUrl: cfg.serverUrl, apiKey: cfg.apiKey };

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await chrome.runtime.sendMessage(msg);
      } catch {
        if (attempt === 0) await new Promise(r => setTimeout(r, 600));
      }
    }

    if (options.fallbackText) {
      return await chrome.runtime.sendMessage({ ...msg, text: options.fallbackText });
    }

    return null;
  }
```

Then call fallback in `_run()`:

```js
      let result = await checkText(runText);
      if (!result?.matches && IS_GMAIL && runText.length > GMAIL_FALLBACK_CHARS) {
        result = await checkText(runText, { fallbackText: runText.slice(-GMAIL_FALLBACK_CHARS) });
        if (result?.matches) {
          this._gmailOffsetBase = text.length - Math.min(GMAIL_FALLBACK_CHARS, runText.length);
        }
      }
```

- [ ] **Step 6: Manual verification**

In Gmail:
- Pegar un correo largo con muchos errores.
- Confirmar que el corrector sigue subrayando (no se cae).

- [ ] **Step 7: Commit**

```bash
git add content.js
git commit -m "fix(gmail): add long-text limits and fallback" 
```

---

### Task 3: Tooltip “Sin sugerencias” UX

**Files:**
- Modify: `content.js`
- Modify: `content.css`

- [ ] **Step 1: Write the failing test**

No hay suite de tests; usar verificación manual.

- [ ] **Step 2: Add message block when no replacements**

In `showTooltip()` after `const reps = ...` add:

```js
    if (!reps.length) {
      html += '<div class="gc-ttip-empty">Sin sugerencias disponibles</div>';
    }
```

- [ ] **Step 3: Style the empty message**

Add to `content.css`:

```css
.gc-ttip-empty {
  font-size: 12px;
  color: #64748b;
  background: #f8fafc;
  border: 1px dashed #e2e8f0;
  padding: 6px 8px;
  border-radius: 6px;
  margin-bottom: 8px;
}
```

- [ ] **Step 4: Manual verification**

- Forzar un error sin replacements (ej. "ke").
- Ver tooltip con “Sin sugerencias disponibles”.

- [ ] **Step 5: Commit**

```bash
git add content.js content.css
git commit -m "ux: show empty-state when no suggestions" 
```

---

## Self-Review Checklist
- [ ] Cobertura: diseño incluye Gmail detection, filtrado, límites, fallback y UX sin sugerencias.
- [ ] No hay placeholders ni pasos vagos.
- [ ] Nombres de variables consistentes (`IS_GMAIL`, `_gmailOffsetBase`).

