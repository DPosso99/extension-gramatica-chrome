@echo off
:: ═══════════════════════════════════════════════════════
::  Registra una Tarea Programada de Windows para
::  iniciar LanguageTool automáticamente al encender el PC.
::  Ejecutar UNA SOLA VEZ como Administrador.
:: ═══════════════════════════════════════════════════════

:: Requiere privilegios de administrador
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Ejecuta este script como Administrador.
    echo  Clic derecho → "Ejecutar como administrador"
    pause
    exit /b 1
)

set TASK_NAME=GramChecker-LanguageTool
set BAT_PATH=%~dp0start-languagetool.bat

echo [INFO] Registrando tarea programada "%TASK_NAME%"...

:: Eliminar si ya existía
schtasks /Delete /TN "%TASK_NAME%" /F >nul 2>&1

:: Crear tarea: se ejecuta al iniciar sesión, sin mostrar ventana
schtasks /Create ^
  /TN "%TASK_NAME%" ^
  /TR "cmd.exe /C \"%BAT_PATH%\"" ^
  /SC ONLOGON ^
  /DELAY 0000:30 ^
  /RL HIGHEST ^
  /F ^
  /IT

if %errorlevel% equ 0 (
    echo [OK] Tarea creada con exito.
    echo      El servidor se iniciara automaticamente cada vez que
    echo      enciendas Windows (30 segundos despues del login).
    echo.
    echo      Para ejecutar AHORA sin reiniciar:
    echo      schtasks /Run /TN "%TASK_NAME%"
) else (
    echo [ERROR] No se pudo crear la tarea. Revisa los permisos.
)

pause
