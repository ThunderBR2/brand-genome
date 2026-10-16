@echo off
setlocal
cd /d "%~dp0"
echo Brand Genome - instalador
echo.
if not exist "%~dp0instalar-brand-genome.ps1" (
  echo Baixando o script de instalacao...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing https://raw.githubusercontent.com/ThunderBR2/brand-genome/main/scripts/instalar-brand-genome.ps1 -OutFile '%~dp0instalar-brand-genome.ps1'"
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar-brand-genome.ps1"
echo.
echo Registro salvo em: %~dp0brand-genome-instalacao.log
pause
