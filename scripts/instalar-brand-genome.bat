@echo off
rem Brand Genome - instalador de um clique (Windows)
powershell -NoProfile -ExecutionPolicy Bypass -Command "iwr -UseBasicParsing https://raw.githubusercontent.com/ThunderBR2/brand-genome/main/scripts/install-windows.ps1 -OutFile $env:TEMP\brand-genome-install.ps1; & $env:TEMP\brand-genome-install.ps1"
