# Brand Genome - instalador para Windows (Downloads -> %USERPROFILE%\BrandGenome)
$ErrorActionPreference = "Stop"
$log = Join-Path $PSScriptRoot "brand-genome-instalacao.log"
try { Start-Transcript -Path $log -Force | Out-Null } catch {}
function Fail($msg) {
  Write-Host ""
  Write-Host "ERRO: $msg" -ForegroundColor Red
  Write-Host "O registro completo esta em: $log"
  try { Stop-Transcript | Out-Null } catch {}
  exit 1
}
try {
  $dest = Join-Path $HOME "BrandGenome"
  Write-Host "== Brand Genome: instalando em $dest ==" -ForegroundColor Cyan
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) { Fail "Node.js nao encontrado no PATH. Instale o Node.js 22 LTS em https://nodejs.org e rode de novo." }
  $nodeVersion = (& node -v).Trim()
  Write-Host "Node.js $nodeVersion em $($node.Source)"
  $major = [int]($nodeVersion.TrimStart("v").Split(".")[0])
  if ($major -lt 22) { Fail "Node.js $nodeVersion e antigo. Instale o Node.js 22 LTS ou mais novo." }
  $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if (-not $npm) { Fail "npm nao encontrado. Reinstale o Node.js marcando a opcao npm." }

  $tmp = Join-Path $env:TEMP ("brand-genome-" + [guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Path $tmp | Out-Null
  $localZip = Join-Path $PSScriptRoot "brand-genome.zip"
  if (Test-Path $localZip) {
    Write-Host "Usando o pacote local brand-genome.zip"
    Copy-Item $localZip (Join-Path $tmp "src.zip")
  } else {
    Write-Host "Baixando do GitHub..."
    try {
      Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/ThunderBR2/brand-genome/archive/refs/heads/main.zip" -OutFile (Join-Path $tmp "src.zip")
    } catch {
      Fail "nao consegui baixar do GitHub ($($_.Exception.Message)). Se o repositorio for privado, coloque o arquivo brand-genome.zip nesta mesma pasta e rode de novo."
    }
  }
  Expand-Archive -Path (Join-Path $tmp "src.zip") -DestinationPath $tmp -Force
  $src = Get-ChildItem -Path $tmp -Directory | Select-Object -First 1
  New-Item -ItemType Directory -Path $dest -Force | Out-Null
  Copy-Item -Path (Join-Path $src.FullName "*") -Destination $dest -Recurse -Force
  Remove-Item -Recurse -Force $tmp

  Set-Location $dest
  Write-Host "Instalando dependencias (alguns minutos)..."
  & $npm.Source install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { Fail "npm install falhou (codigo $LASTEXITCODE)." }
  Write-Host "Compilando..."
  & $npm.Source run build
  if ($LASTEXITCODE -ne 0) { Fail "a compilacao falhou (codigo $LASTEXITCODE)." }

  Write-Host "Instalando o navegador para sites feitos em JavaScript (opcional)..."
  try { & (Join-Path $dest "node_modules\.bin\playwright.cmd") install chromium } catch { Write-Host "Chromium nao instalado; sites comuns continuam funcionando." -ForegroundColor Yellow }

  Write-Host "Conectando ao Claude Desktop..."
  & node (Join-Path $dest "dist\cli.js") mcp-config --install
  if ($LASTEXITCODE -ne 0) { Fail "nao consegui configurar o Claude Desktop." }
  & node (Join-Path $dest "dist\cli.js") canon stats

  Write-Host ""
  Write-Host "PRONTO. Feche o Claude Desktop pelo icone da bandeja (Sair) e abra de novo." -ForegroundColor Green
  try { Stop-Transcript | Out-Null } catch {}
  exit 0
} catch {
  Fail $_.Exception.Message
}
