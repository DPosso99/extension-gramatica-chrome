# Gmail Long-Text Improvements — Diseño

## Contexto
En Gmail, los textos largos con muchos errores provocan que las sugerencias de GramChecker se vuelvan inconsistentes (subrayados desaparecen, tooltip no aparece o aparece sin sugerencias). En textos cortos el flujo ya funciona bien. El objetivo es mejorar la precisión y el rendimiento **solo** en mensajes largos, sin romper el comportamiento actual.

## Objetivos
1. **Precisión en Gmail**: asegurar que el corrector mantenga sugerencias en mensajes largos con muchos errores.
2. **Rendimiento**: evitar timeouts y sobrecarga al analizar textos con historial de correo incluido.
3. **UX**: comunicar cuando un error no tiene sugerencias para evitar la sensación de “no funciona”.

## Alcance
- Aplicar mejoras solo cuando el dominio sea `mail.google.com`.
- Limitar análisis a texto reciente y relevante en correos largos.
- No tocar el flujo normal fuera de Gmail ni el contenido corto.

## Diseño

### 1. Detección automática de Gmail
- Detectar `location.hostname === 'mail.google.com'`.
- Activar “modo Gmail” sin toggle manual.

### 2. Filtrado de contenido en Gmail
Ignorar nodos que no son texto actual:
- `.gmail_quote`, `.gmail_signature`, `.gmail_attr`, `.gmail_extra`.
- Bloques citados (`<blockquote>` en Gmail).

Resultado: se analiza solo el texto nuevo del usuario, reduciendo el tamaño total.

### 3. Límite de texto y fallback
- Establecer límite de caracteres (p.ej. 8k–12k) para análisis en Gmail.
- Si el texto excede el límite, tomar **solo la parte final** (texto más reciente).
- Si ocurre timeout o no hay respuesta, reintentar con un fragmento más pequeño.

### 4. UX: “Sin sugerencias”
Cuando el error no tenga replacements:
- Tooltip muestra mensaje explícito: “Sin sugerencias disponibles”.
- Evita percepción de fallo.

## Impacto esperado
- Más estabilidad en Gmail para mensajes largos.
- Menos timeouts del servidor local.
- Mayor claridad para el usuario cuando LanguageTool no devuelve reemplazos.

## Archivos afectados
- `content.js` (detección Gmail + filtrado de nodos + límite de texto + fallback)
- `background.js` (timeout / fallback si aplica)
- `content.css` (pequeño estilo para mensaje “sin sugerencias” si se agrega)

## UX (estilo)
- Mantener estilo actual.
- Tooltip: mensaje de estado claro si no hay sugerencias.

