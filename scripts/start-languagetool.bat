@echo off
:: ═══════════════════════════════════════════════════════
::  GramChecker - Iniciador de LanguageTool Server
::  Coloca el .jar de LanguageTool en la misma carpeta
::  que este script, o ajusta LT_JAR a tu ruta.
:: ═══════════════════════════════════════════════════════

:: ── Configuración ───────────────────────────────────────
set LT_JAR=%~dp0languagetool-server.jar
set LT_PORT=8081
set LT_HEAP=512m

:: ── Verificar Java ──────────────────────────────────────
where java >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Java no encontrado. Instala Java 11+ desde adoptium.net
    pause
    exit /b 1
)

:: ── Verificar que no esté ya corriendo ─────────────────
netstat -ano | findstr ":%LT_PORT% " | findstr "LISTENING" >nul 2>&1
if %errorlevel% equ 0 (
    echo [INFO] LanguageTool ya está corriendo en el puerto %LT_PORT%.
    exit /b 0
)

:: ── Iniciar servidor ────────────────────────────────────
echo [INFO] Iniciando LanguageTool Server en puerto %LT_PORT%...
start "" /B java -Xmx%LT_HEAP% -jar "%LT_JAR%" ^
    --port %LT_PORT% ^
    --allow-origin "*" ^
    --languageModel . ^
    2>>"%~dp0languagetool.log"

echo [OK] Servidor iniciado. Log: %~dp0languagetool.log
