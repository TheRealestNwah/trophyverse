; A crashed Trophyverse can leave its bundled PostgreSQL running, which locks
; files the installer needs to replace or remove. Only processes started from
; this app's own bundled binaries are touched, never a separately installed
; PostgreSQL. NSIS is 32-bit, and a 32-bit PowerShell can't read a 64-bit
; process's path through Get-Process, so this goes through CIM instead.
!macro stopBundledPostgres
  nsExec::Exec `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { $$_.Name -eq 'postgres.exe' -and $$_.ExecutablePath -like '*\resources\server\node_modules\@embedded-postgres\*' } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force }"`
  Pop $0
!macroend

!macro customInit
  !insertmacro stopBundledPostgres
!macroend

!macro customUnInit
  !insertmacro stopBundledPostgres
!macroend
