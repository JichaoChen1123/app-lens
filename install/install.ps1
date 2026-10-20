[CmdletBinding()]
param([string]$NativeArchive, [switch]$SkipDependencies)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$package = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not [Environment]::Is64BitOperatingSystem -or $env:OS -ne 'Windows_NT') { throw 'AppLens requires Windows x64.' }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw '请先安装 Node.js 24.18.0，再运行此脚本。' }
$versionText = & node --version
if ($LASTEXITCODE -ne 0) { throw '无法启动 Node.js。' }
$nodeVersion = [version]$versionText.TrimStart('v')
$nodeArchitecture = & node -p process.arch
if ($LASTEXITCODE -ne 0 -or $nodeArchitecture -ne 'x64' -or -not (($nodeVersion.Major -eq 22 -and $nodeVersion.Minor -ge 19) -or ($nodeVersion.Major -eq 24 -and $nodeVersion.Minor -ge 11) -or $nodeVersion.Major -ge 26)) { throw '需要 x64 Node.js 22.19+、24.11+ 或 26+。推荐 24.18.0。' }
if ($NativeArchive) { $NativeArchive = (Resolve-Path -LiteralPath $NativeArchive).Path }
Push-Location $projectRoot
try {
    $cacheRoot = Join-Path $projectRoot '.cache\windows-install'
    New-Item -ItemType Directory -Path $cacheRoot -Force | Out-Null
    if (-not $NativeArchive) {
        $NativeArchive = Join-Path $cacheRoot 'applens-windows-x64-native.zip'
        $releaseUrl = "https://github.com/JichaoChen1123/app-lens/releases/download/v$($package.version)/applens-windows-x64-native.zip"
        Write-Host '正在下载 AppLens Windows 组件……'
        Invoke-WebRequest -Uri $releaseUrl -OutFile $NativeArchive -UseBasicParsing
    }
    $archivePath = (Resolve-Path -LiteralPath $NativeArchive).Path
    $staging = Join-Path $cacheRoot ([guid]::NewGuid().ToString('N'))
    Expand-Archive -LiteralPath $archivePath -DestinationPath $staging
    $manifestFile = Join-Path $staging 'manifest.json'
    $binaryFile = Join-Path $staging 'rea-windows-x64.node'
    $manifest = Get-Content -LiteralPath $manifestFile -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($manifest.packageVersion -ne $package.version -or $manifest.platform -ne 'win32' -or $manifest.architecture -ne 'x64' -or $manifest.nodeApiVersion -ne 8 -or $manifest.abiVersion -ne 1 -or $manifest.artifact -ne 'rea-windows-x64.node') { throw 'Windows 组件版本或平台不匹配。' }
    $digest = (Get-FileHash -LiteralPath $binaryFile -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($digest -cne $manifest.artifactSha256) { throw 'Windows 组件 SHA-256 校验失败。' }
    & node scripts/verify-windows-native-artifact.mjs $staging
    if ($LASTEXITCODE -ne 0) { throw 'Windows 组件验证失败，已有组件未被替换。' }
    $output = Join-Path $projectRoot 'native\windows\build'
    New-Item -ItemType Directory -Path $output -Force | Out-Null
    Copy-Item -LiteralPath $binaryFile -Destination (Join-Path $output 'rea-windows-x64.node') -Force
    Copy-Item -LiteralPath $manifestFile -Destination (Join-Path $output 'manifest.json') -Force
    & node scripts/verify-windows-native-artifact.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Windows 组件验证失败。' }
    if (-not $SkipDependencies) {
        & npm.cmd ci --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org
        if ($LASTEXITCODE -ne 0) { throw '依赖安装失败。' }
    }
    & npm.cmd run build:cached
    if ($LASTEXITCODE -ne 0) { throw 'AppLens 构建失败。' }
    Write-Host 'AppLens 已准备好。运行 .\install\applens.cmd --help 查看命令。'
} finally { Pop-Location }
