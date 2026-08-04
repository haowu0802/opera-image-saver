<#
.SYNOPSIS
  Install the Image Saver native messaging host for Opera/Chrome on Windows.

.DESCRIPTION
  This script:
  1. Updates the native host manifest JSON with the correct .bat path and extension ID.
  2. Registers the manifest in the Windows registry for Opera and Chrome.

.PARAMETER ExtensionId
  The ID of the loaded extension (shown in opera://extensions or chrome://extensions).
  Example: "abcdefghijklmnopabcdefghijklmnop"

.EXAMPLE
  .\install_host.ps1 -ExtensionId "abcdefghijklmnopabcdefghijklmnop"
#>

param(
  [Parameter(Mandatory=$true, HelpMessage="The extension ID from opera://extensions")]
  [string]$ExtensionId
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$BatPath = Join-Path $ScriptDir "run_host.bat"
$ManifestPath = Join-Path $ScriptDir "com.hexwell.image_saver.json"
$HostName = "com.hexwell.image_saver"

# --- Validate ---
if (-not (Test-Path $BatPath)) {
  Write-Error "run_host.bat not found at: $BatPath"
  exit 1
}

# --- Update manifest JSON ---
Write-Host "Updating manifest: $ManifestPath" -ForegroundColor Cyan

$manifest = Get-Content $ManifestPath -Raw | ConvertFrom-Json
$manifest.path = $BatPath
$manifest.allowed_origins = @("chrome-extension://$ExtensionId/")
$manifest | ConvertTo-Json -Depth 5 | Set-Content $ManifestPath -Encoding UTF8

Write-Host "  path:           $BatPath" -ForegroundColor Gray
Write-Host "  allowed_origins: chrome-extension://$ExtensionId/" -ForegroundColor Gray

# --- Register in Windows Registry ---
# Opera is Chromium-based and checks the same registry paths as Chrome.
# We register in all relevant paths to ensure compatibility.

$registryPaths = @(
  "HKCU:\SOFTWARE\Google\Chrome\NativeMessagingHosts\$HostName",
  "HKCU:\SOFTWARE\Opera Software\Opera Stable\NativeMessagingHosts\$HostName",
  "HKCU:\SOFTWARE\Chromium\NativeMessagingHosts\$HostName"
)

foreach ($regPath in $registryPaths) {
  Write-Host "Registering: $regPath" -ForegroundColor Cyan

  # Create the registry key (creates parent keys if needed)
  if (-not (Test-Path $regPath)) {
    New-Item -Path $regPath -Force | Out-Null
  }

  # Set the default value to the manifest path
  Set-ItemProperty -Path $regPath -Name "(default)" -Value $ManifestPath

  Write-Host "  -> $ManifestPath" -ForegroundColor Gray
}

# --- Verify Python is available ---
Write-Host "`nChecking Python availability..." -ForegroundColor Cyan
$pythonCheck = & python --version 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Warning "Python not found in PATH. Make sure Python 3 is installed and added to PATH."
} else {
  Write-Host "  Python found: $pythonCheck" -ForegroundColor Green
}

# --- Done ---
Write-Host "`n=== Installation Complete ===" -ForegroundColor Green
Write-Host "Native host manifest: $ManifestPath"
Write-Host "Extension ID:         $ExtensionId"
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Reload the extension in opera://extensions"
Write-Host "  2. Open the extension popup and click 'Test Connection'"
Write-Host "  3. If the test passes, hover any image on a webpage to save it"
