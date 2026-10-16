# Brand Genome - instalador para Windows
# Baixa a versão mais nova do GitHub, instala, compila e conecta ao Claude Desktop.
$ErrorActionPreference = "Stop"
$dest = Join-Path $HOME "BrandGenome"
Write-Host ""
Write-Host "== Brand Genome: instalando em $dest ==" -ForegroundColor Cyan

try { $nodeVersion = (& node -v) } catch { $nodeVersion = $null }
if (-not $nodeVersion) {
  Write-Host "Node.js nao encontrado. Instale o Node.js 22 LTS em https://nodejs.org e rode este instalador de novo." -ForegroundColor Red
  Read-Host "Aperte Enter para fechar"; exit 1
}
$major = [int]($nodeVersion.TrimStart("v").Split(".")[0])
if ($major -lt 22) {
  Write-Host "Node.js $nodeVersion e antigo. Instale o Node.js 22 LTS ou mais novo em https://nodejs.org." -ForegroundColor Red
  Read-Host "Aperte Enter para fechar"; exit 1
}
Write-Host "Node.js $nodeVersion ok"

$tmp = Join-Path $env:TEMP ("brand-genome-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tmp | Out-Null
Write-Host "Baixando do GitHub..."
Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/ThunderBR2/brand-genome/archive/refs/heads/main.zip" -OutFile (Join-Path $tmp "src.zip")
Expand-Archive -Path (Join-Path $tmp "src.zip") -DestinationPath $tmp -Force
$src = Get-ChildItem -Path $tmp -Directory | Select-Object -First 1
New-Item -ItemType Directory -Path $dest -Force | Out-Null
Copy-Item -Path (Join-Path $src.FullName "*") -Destination $dest -Recurse -Force
Remove-Item -Recurse -Force $tmp

Set-Location $dest
Write-Host "Instalando dependencias (pode levar alguns minutos)..."
& npm install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { Write-Host "Falha no npm install." -ForegroundColor Red; Read-Host "Aperte Enter para fechar"; exit 1 }
Write-Host "Compilando..."
& npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "Falha ao compilar." -ForegroundColor Red; Read-Host "Aperte Enter para fechar"; exit 1 }

Write-Host "Instalando o navegador para ler sites feitos em JavaScript (opcional)..."
& npx playwright install chromium
if ($LASTEXITCODE -ne 0) { Write-Host "Chromium nao instalado; sites comuns continuam funcionando." -ForegroundColor Yellow }

Write-Host "Conectando ao Claude Desktop..."
& node (Join-Path $dest "dist\cli.js") mcp-config --install
if ($LASTEXITCODE -ne 0) { Write-Host "Falha ao configurar o Claude Desktop." -ForegroundColor Red; Read-Host "Aperte Enter para fechar"; exit 1 }
& node (Join-Path $dest "dist\cli.js") canon stats

Write-Host ""
Write-Host "Pronto. Feche o Claude Desktop pelo icone da bandeja (Sair) e abra de novo." -ForegroundColor Green
Read-Host "Aperte Enter para fechar"
