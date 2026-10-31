<#
.SYNOPSIS
    Personal AI Studio - Safe Local Snapshot Backup Script
.DESCRIPTION
    Tạo bản sao lưu nén (.zip) của Workspace C:\AI-Studio vào thư mục storage/backups/.
    Tự động loại trừ các thư mục nặng (node_modules, Unity Library/Temp/Obj/Logs, .git, và chính thư mục backups).
.PARAMETER Label
    Nhãn mô tả lý do tạo snapshot (mặc định: "manual").
.PARAMETER WorkspaceRoot
    Đường dẫn gốc của Studio (mặc định: "C:\AI-Studio").
#>
param(
    [string]$Label = "manual",
    [string]$WorkspaceRoot = "C:\AI-Studio"
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$resolvedRoot = (Resolve-Path $WorkspaceRoot).Path.TrimEnd('\', '/')
$backupsDir = Join-Path $resolvedRoot "storage\backups"

if (-not (Test-Path $backupsDir)) {
    New-Item -ItemType Directory -Path $backupsDir -Force | Out-Null
}

# Làm sạch Label để an toàn cho tên file
$safeLabel = ($Label -replace '[^a-zA-Z0-9_-]', '-').ToLower().Trim('-')
if ([string]::IsNullOrWhiteSpace($safeLabel)) {
    $safeLabel = "manual"
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$zipFileName = "snapshot-$timestamp-$safeLabel.zip"
$zipFilePath = Join-Path $backupsDir $zipFileName

# Các thư mục loại trừ (không đưa vào bản zip để tránh đệ quy và phình dung lượng)
$excludedDirPatterns = @(
    "^\.git($|\\)",
    "^storage\\backups($|\\)",
    "(^|\\)node_modules($|\\)",
    "(^|\\)dist($|\\)",
    "(^|\\)\.vite($|\\)",
    "(^|\\)\.vs($|\\)",
    "(^|\\)\.idea($|\\)",
    "^projects\\[^\\]+\\[Ll]ibrary($|\\)",
    "^projects\\[^\\]+\\[Tt]emp($|\\)",
    "^projects\\[^\\]+\\[Oo]bj($|\\)",
    "^projects\\[^\\]+\\[Ll]ogs($|\\)",
    "^projects\\[^\\]+\\[Bb]uilds?($|\\)",
    "^projects\\[^\\]+\\[Uu]ser[Ss]ettings($|\\)",
    "^projects\\[^\\]+\\[Mm]emory[Cc]aptures($|\\)"
)

function Test-ShouldExclude([string]$relativePath) {
    foreach ($pattern in $excludedDirPatterns) {
        if ($relativePath -match $pattern) {
            return $true
        }
    }
    return $false
}

$allFiles = Get-ChildItem -Path $resolvedRoot -Recurse -File -Force
$filesToBackup = @()

foreach ($file in $allFiles) {
    $relPath = $file.FullName.Substring($resolvedRoot.Length + 1)
    if (-not (Test-ShouldExclude $relPath)) {
        $filesToBackup += [PSCustomObject]@{
            FullPath = $file.FullName
            RelPath  = $relPath
        }
    }
}

# Lấy nhánh Git hiện tại (nếu có)
$gitBranch = "unknown"
try {
    $branchOut = git -C $resolvedRoot branch --show-current 2>$null
    if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($branchOut)) {
        $gitBranch = $branchOut.Trim()
    }
} catch {
    $gitBranch = "unknown"
}

# Tạo file Zip
if (Test-Path $zipFilePath) {
    Remove-Item $zipFilePath -Force
}

$zipArchive = [System.IO.Compression.ZipFile]::Open($zipFilePath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($item in $filesToBackup) {
        $entryName = $item.RelPath -replace '\\', '/'
        # Dùng FileStream với FileShare ReadWrite để an toàn cả khi SQLite đang mở
        $entry = $zipArchive.CreateEntry($entryName, [System.IO.Compression.CompressionLevel]::Optimal)
        $entryStream = $entry.Open()
        try {
            $fileStream = [System.IO.File]::Open(
                $item.FullPath,
                [System.IO.FileMode]::Open,
                [System.IO.FileAccess]::Read,
                [System.IO.FileShare]::ReadWrite
            )
            try {
                $fileStream.CopyTo($entryStream)
            } finally {
                $fileStream.Dispose()
            }
        } finally {
            $entryStream.Dispose()
        }
    }

    # Ghi kèm manifest vào trong bản nén
    $manifestObj = [ordered]@{
        studio       = "Personal AI Studio"
        createdAt    = (Get-Date -Format "o")
        label        = $safeLabel
        gitBranch    = $gitBranch
        fileCount    = $filesToBackup.Count
        workspace    = $resolvedRoot
    }
    $manifestJson = $manifestObj | ConvertTo-Json -Depth 4
    $manifestEntry = $zipArchive.CreateEntry("snapshot-manifest.json", [System.IO.Compression.CompressionLevel]::Optimal)
    $writer = New-Object System.IO.StreamWriter($manifestEntry.Open(), [System.Text.Encoding]::UTF8)
    try {
        $writer.Write($manifestJson)
    } finally {
        $writer.Dispose()
    }
} finally {
    $zipArchive.Dispose()
}

$zipInfo = Get-Item $zipFilePath

$result = [ordered]@{
    status    = "SUCCESS"
    zipName   = $zipFileName
    zipPath   = $zipInfo.FullName
    sizeBytes = $zipInfo.Length
    fileCount = $filesToBackup.Count
    gitBranch = $gitBranch
    createdAt = (Get-Date -Format "o")
}

$result | ConvertTo-Json -Depth 3

