# Builds .data.js companions for file:// viewer (base64 bodies — safe JS literals).
# Usage:
#   .\build-offline-data.ps1           # repair + ncf
#   .\build-offline-data.ps1 -Manual ncf
param(
  [ValidateSet("all", "repair", "ncf")]
  [string]$Manual = "all"
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")

function Get-BodyInnerHtml([string]$html) {
  if ($html -match '(?is)<body\b[^>]*>(.*)</body>') {
    return $Matches[1]
  }
  return $html
}

function Get-BodyClass([string]$html) {
  if ($html -match '(?is)<body\b([^>]*)>') {
    $attrs = $Matches[1]
    if ($attrs -match '(?i)class\s*=\s*"([^"]*)"') { return $Matches[1] }
    if ($attrs -match "(?i)class\s*=\s*'([^']*)'") { return $Matches[1] }
  }
  return ""
}

function Write-DataJs([string]$outPath, [string]$key, [string]$body, [string]$bodyClass, [string]$basePath) {
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
  $b64 = [Convert]::ToBase64String($bytes)
  $keyJson = ($key | ConvertTo-Json -Compress)
  $classJson = ($bodyClass | ConvertTo-Json -Compress)
  $baseJson = ($basePath | ConvertTo-Json -Compress)
  $b64Json = ($b64 | ConvertTo-Json -Compress)
  $js = "(window.__TD_DATA__=window.__TD_DATA__||{})[$keyJson]={bodyB64:$b64Json,bodyClass:$classJson,base:$baseJson};"
  [System.IO.File]::WriteAllText($outPath, $js, [System.Text.UTF8Encoding]::new($false))
}

function Convert-HtmlFile([string]$htmlPath, [string]$key, [string]$baseRel) {
  $html = [System.IO.File]::ReadAllText($htmlPath)
  $body = Get-BodyInnerHtml $html
  $cls = Get-BodyClass $html
  $out = [System.IO.Path]::ChangeExtension($htmlPath, ".data.js")
  Write-DataJs -outPath $out -key $key -body $body -bodyClass $cls -basePath $baseRel
}

function Build-Manual([string]$manualRoot, [string]$label) {
  Write-Host "Building offline .data.js for $label under $manualRoot"
  $tocDir = Join-Path $manualRoot "repair2\html\toc"
  $contentsDir = Join-Path $manualRoot "repair2\html\contents"

  $n = 0
  Get-ChildItem $tocDir -Filter "*.html" -File | Where-Object { $_.Name -notlike 'sts_*' } | ForEach-Object {
    Convert-HtmlFile $_.FullName ("toc:" + $_.BaseName.ToLower()) ("repair2/html/toc/" + $_.Name)
    $n++
  }
  Write-Host "  toc data: $n"

  $n = 0
  Get-ChildItem $contentsDir -Filter "rm*.html" -File | ForEach-Object {
    Convert-HtmlFile $_.FullName ("page:" + $_.BaseName.ToLower()) ("repair2/html/contents/" + $_.Name)
    $n++
    if (($n % 500) -eq 0) { Write-Host "  pages $n..." }
  }
  Write-Host "  page data: $n"

  $n = 0
  Get-ChildItem $contentsDir -Filter "local_*.html" -File | ForEach-Object {
    Convert-HtmlFile $_.FullName ("local:" + $_.BaseName.ToLower()) ("repair2/html/contents/" + $_.Name)
    $n++
  }
  Write-Host "  local data: $n"
}

if ($Manual -eq "all" -or $Manual -eq "repair") {
  Build-Manual (Join-Path $root "rm14k1e") "Repair Manual"
}
if ($Manual -eq "all" -or $Manual -eq "ncf") {
  Build-Manual (Join-Path $root "rm14k1e\ncf") "New Car Features"
}
Write-Host "Done."
