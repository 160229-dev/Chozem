param(
  [Parameter(Mandatory = $true)][string]$Path,
  [string]$Out
)

$ErrorActionPreference = 'Stop'

$src = (Resolve-Path $Path).Path
if (-not (Test-Path (Join-Path $src 'manifest.json'))) {
  throw "manifest.json not found in $src"
}
if (-not $Out) {
  $Out = Join-Path (Split-Path $src -Parent) ((Split-Path $src -Leaf) + '.zip')
}
if (Test-Path $Out) {
  Remove-Item $Out -Force
}
Compress-Archive -Path (Join-Path $src '*') -DestinationPath $Out -Force
Write-Host "packed -> $Out"
