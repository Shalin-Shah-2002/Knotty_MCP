# Quick Setup - Common API Examples

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet('petstore', 'github', 'stripe', 'custom')]
    [string]$API = 'custom'
)

$configPath = "$env:APPDATA\Claude\claude_desktop_config.json"

# Predefined API configurations
$apis = @{
    'petstore' = @{
        url = 'https://petstore.swagger.io/v2/swagger.json'
        name = 'Swagger Petstore'
        auth = $false
    }
    'github' = @{
        url = 'https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json'
        name = 'GitHub API'
        auth = $false
    }
    'stripe' = @{
        url = 'https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json'
        name = 'Stripe API'
        auth = $false
    }
}

Write-Host "=== Swagger MCP Quick Setup ===" -ForegroundColor Cyan
Write-Host ""

if ($API -ne 'custom') {
    $apiConfig = $apis[$API]
    Write-Host "Setting up: $($apiConfig.name)" -ForegroundColor Green
    $url = $apiConfig.url
} else {
    Write-Host "Available quick setups:" -ForegroundColor Yellow
    Write-Host "  .\setup-quick.ps1 -API petstore   # Swagger Petstore example" -ForegroundColor Gray
    Write-Host "  .\setup-quick.ps1 -API github     # GitHub REST API" -ForegroundColor Gray
    Write-Host "  .\setup-quick.ps1 -API stripe     # Stripe API" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Or enter a custom OpenAPI URL:" -ForegroundColor Yellow
    $url = Read-Host "URL"
    
    if ([string]::IsNullOrWhiteSpace($url)) {
        Write-Host "Using default: Petstore API" -ForegroundColor Gray
        $url = 'https://petstore.swagger.io/v2/swagger.json'
    }
}

# Load current config
if (Test-Path $configPath) {
    $config = Get-Content $configPath -Raw | ConvertFrom-Json
} else {
    $config = @{ mcpServers = @{} } | ConvertTo-Json | ConvertFrom-Json
}

# Update swagger-api config
$swaggerConfig = @{
    command = "node"
    args = @("d:/S_Projects/Swagger_MCP/dist/index.js")
    env = @{
        OPENAPI_SPEC_URL = $url
        LOG_LEVEL = "info"
        CACHE_REFRESH_MINUTES = "10"
        RATE_LIMIT_MAX = "60"
    }
}

if (-not $config.mcpServers) {
    $config | Add-Member -MemberType NoteProperty -Name "mcpServers" -Value @{} -Force
}

$config.mcpServers | Add-Member -MemberType NoteProperty -Name "swagger-api" -Value $swaggerConfig -Force

# Save with Node.js
$tempJson = $config | ConvertTo-Json -Depth 10
$escapedJson = $tempJson -replace '"', '\"' -replace '\n', '\n' -replace '\r', ''

node -e "const fs = require('fs'); fs.writeFileSync('$($configPath -replace '\\', '/')', JSON.stringify($($config | ConvertTo-Json -Depth 10 -Compress), null, 2), 'utf8'); console.log('Done');"

Write-Host ""
Write-Host "✓ Configured: $url" -ForegroundColor Green
Write-Host ""
Write-Host "Restart Claude Desktop to apply changes!" -ForegroundColor Yellow
