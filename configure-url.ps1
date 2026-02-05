# Configure Swagger MCP Server URL
# This script updates the Claude Desktop config with your OpenAPI/Swagger URL

Write-Host "=== Swagger MCP Server Configuration ===" -ForegroundColor Cyan
Write-Host ""

# Get current config
$configPath = "$env:APPDATA\Claude\claude_desktop_config.json"
if (Test-Path $configPath) {
    $currentConfig = Get-Content $configPath -Raw | ConvertFrom-Json
} else {
    Write-Host "Error: Claude Desktop config not found!" -ForegroundColor Red
    exit 1
}

# Prompt for URL
Write-Host "Enter your OpenAPI/Swagger specification URL:" -ForegroundColor Yellow
Write-Host "Examples:" -ForegroundColor Gray
Write-Host "  - https://petstore.swagger.io/v2/swagger.json" -ForegroundColor Gray
Write-Host "  - https://api.example.com/openapi.json" -ForegroundColor Gray
Write-Host "  - https://api.example.com/v1/swagger.yaml" -ForegroundColor Gray
Write-Host ""
$url = Read-Host "URL"

if ([string]::IsNullOrWhiteSpace($url)) {
    Write-Host "Error: URL cannot be empty!" -ForegroundColor Red
    exit 1
}

# Validate URL format
try {
    [System.Uri]$uri = $url
    if ($uri.Scheme -notin @('http', 'https')) {
        Write-Host "Error: URL must start with http:// or https://" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "Error: Invalid URL format!" -ForegroundColor Red
    exit 1
}

# Prompt for optional auth token
Write-Host ""
Write-Host "Does this API require authentication? (y/N):" -ForegroundColor Yellow
$needsAuth = Read-Host
$authToken = ""

if ($needsAuth -eq 'y' -or $needsAuth -eq 'Y') {
    Write-Host "Enter Bearer token (leave empty to skip):" -ForegroundColor Yellow
    $authToken = Read-Host -AsSecureString
    $authToken = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($authToken)
    )
}

# Prompt for cache refresh interval
Write-Host ""
Write-Host "Cache refresh interval in minutes (default 10):" -ForegroundColor Yellow
$cacheMinutes = Read-Host
if ([string]::IsNullOrWhiteSpace($cacheMinutes)) {
    $cacheMinutes = "10"
}

# Update config
if (-not $currentConfig.mcpServers) {
    $currentConfig | Add-Member -MemberType NoteProperty -Name "mcpServers" -Value @{}
}

$swaggerConfig = @{
    command = "node"
    args = @("d:/S_Projects/Swagger_MCP/dist/index.js")
    env = @{
        OPENAPI_SPEC_URL = $url
        LOG_LEVEL = "info"
        CACHE_REFRESH_MINUTES = $cacheMinutes
        RATE_LIMIT_MAX = "60"
    }
}

if (-not [string]::IsNullOrWhiteSpace($authToken)) {
    $swaggerConfig.env.SWAGGER_AUTH_TOKEN = $authToken
}

$currentConfig.mcpServers | Add-Member -MemberType NoteProperty -Name "swagger-api" -Value $swaggerConfig -Force

# Save config using Node.js for proper encoding
$configJson = $currentConfig | ConvertTo-Json -Depth 10 -Compress
$configJson = $configJson -replace '"', '\"'

$nodeCmd = @"
const fs = require('fs');
const config = $($currentConfig | ConvertTo-Json -Depth 10);
fs.writeFileSync('$($configPath -replace '\\', '/')', JSON.stringify(config, null, 2), 'utf8');
console.log('✓ Configuration saved!');
"@

node -e $nodeCmd

Write-Host ""
Write-Host "✓ Configuration updated successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Configuration:" -ForegroundColor Cyan
Write-Host "  URL: $url" -ForegroundColor White
Write-Host "  Auth: $(if ($authToken) { 'Enabled' } else { 'None' })" -ForegroundColor White
Write-Host "  Cache: $cacheMinutes minutes" -ForegroundColor White
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Restart Claude Desktop (quit completely)" -ForegroundColor White
Write-Host "2. Look for the 🔌 icon to see 'swagger-api' tools" -ForegroundColor White
Write-Host "3. Test with: 'Use getApiInfo to show API details'" -ForegroundColor White
