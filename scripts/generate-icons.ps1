Add-Type -AssemblyName System.Drawing

$rootDir = Split-Path -Parent $PSScriptRoot
$publicDir = Join-Path $rootDir "public"
$logoPath = Join-Path $publicDir "logo.png"

if (-not (Test-Path $logoPath)) {
    Write-Error "logo.png not found at $logoPath"
    exit 1
}

$srcImg = [System.Drawing.Bitmap]::FromFile($logoPath)
Write-Host "Loaded public/logo.png: $($srcImg.Width)x$($srcImg.Height)"

function CreateResizedPng([System.Drawing.Bitmap]$src, [int]$w, [int]$h, [double]$ratio, [string]$outPath, [System.Drawing.Color]$bgColor = [System.Drawing.Color]::Transparent) {
    $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear($bgColor)

    $scale = [Math]::Min(($w * $ratio) / $src.Width, ($h * $ratio) / $src.Height)
    $destW = [int]($src.Width * $scale)
    $destH = [int]($src.Height * $scale)
    $destX = [int](($w - $destW) / 2)
    $destY = [int](($h - $destH) / 2)

    $g.DrawImage($src, $destX, $destY, $destW, $destH)
    $g.Dispose()

    $parentDir = Split-Path -Parent $outPath
    if (-not (Test-Path $parentDir)) {
        New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
    }
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Created: $outPath ($w x $h)"
}

function CreateIco([System.Drawing.Bitmap]$src, [int[]]$sizes, [string]$outPath) {
    $pngStreams = @()
    foreach ($sz in $sizes) {
        $bmp = New-Object System.Drawing.Bitmap($sz, $sz, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.Clear([System.Drawing.Color]::Transparent)

        $scale = [Math]::Min(($sz * 0.9) / $src.Width, ($sz * 0.9) / $src.Height)
        $destW = [int]($src.Width * $scale)
        $destH = [int]($src.Height * $scale)
        $destX = [int](($sz - $destW) / 2)
        $destY = [int](($sz - $destH) / 2)
        $g.DrawImage($src, $destX, $destY, $destW, $destH)
        $g.Dispose()

        $ms = New-Object System.IO.MemoryStream
        $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
        $bmp.Dispose()
        $pngStreams += @{ Size = $sz; Bytes = $ms.ToArray() }
        $ms.Dispose()
    }

    $fs = [System.IO.File]::Create($outPath)
    $bw = New-Object System.IO.BinaryWriter($fs)

    $bw.Write([uint16]0)
    $bw.Write([uint16]1)
    $bw.Write([uint16]$pngStreams.Count)

    $offset = 6 + (16 * $pngStreams.Count)
    foreach ($entry in $pngStreams) {
        $sz = $entry.Size
        $w = if ($sz -ge 256) { 0 } else { [byte]$sz }
        $h = if ($sz -ge 256) { 0 } else { [byte]$sz }
        $bw.Write([byte]$w)
        $bw.Write([byte]$h)
        $bw.Write([byte]0)
        $bw.Write([byte]0)
        $bw.Write([uint16]1)
        $bw.Write([uint16]32)
        $bw.Write([uint32]$entry.Bytes.Length)
        $bw.Write([uint32]$offset)
        $offset += $entry.Bytes.Length
    }

    foreach ($entry in $pngStreams) {
        $bw.Write($entry.Bytes)
    }

    $bw.Flush()
    $bw.Dispose()
    $fs.Dispose()
    Write-Host "Created ICO: $outPath with $($sizes.Count) sizes"
}

# 1. Android Mipmap Launcher Icons
$androidRes = Join-Path $rootDir "android\app\src\main\res"

# mdpi
CreateResizedPng $srcImg 48 48 0.88 (Join-Path $androidRes "mipmap-mdpi\ic_launcher.png")
CreateResizedPng $srcImg 48 48 0.88 (Join-Path $androidRes "mipmap-mdpi\ic_launcher_round.png")
CreateResizedPng $srcImg 108 108 0.66 (Join-Path $androidRes "mipmap-mdpi\ic_launcher_foreground.png")

# hdpi
CreateResizedPng $srcImg 72 72 0.88 (Join-Path $androidRes "mipmap-hdpi\ic_launcher.png")
CreateResizedPng $srcImg 72 72 0.88 (Join-Path $androidRes "mipmap-hdpi\ic_launcher_round.png")
CreateResizedPng $srcImg 162 162 0.66 (Join-Path $androidRes "mipmap-hdpi\ic_launcher_foreground.png")

# xhdpi
CreateResizedPng $srcImg 96 96 0.88 (Join-Path $androidRes "mipmap-xhdpi\ic_launcher.png")
CreateResizedPng $srcImg 96 96 0.88 (Join-Path $androidRes "mipmap-xhdpi\ic_launcher_round.png")
CreateResizedPng $srcImg 216 216 0.66 (Join-Path $androidRes "mipmap-xhdpi\ic_launcher_foreground.png")

# xxhdpi
CreateResizedPng $srcImg 144 144 0.88 (Join-Path $androidRes "mipmap-xxhdpi\ic_launcher.png")
CreateResizedPng $srcImg 144 144 0.88 (Join-Path $androidRes "mipmap-xxhdpi\ic_launcher_round.png")
CreateResizedPng $srcImg 324 324 0.66 (Join-Path $androidRes "mipmap-xxhdpi\ic_launcher_foreground.png")

# xxxhdpi
CreateResizedPng $srcImg 192 192 0.88 (Join-Path $androidRes "mipmap-xxxhdpi\ic_launcher.png")
CreateResizedPng $srcImg 192 192 0.88 (Join-Path $androidRes "mipmap-xxxhdpi\ic_launcher_round.png")
CreateResizedPng $srcImg 432 432 0.66 (Join-Path $androidRes "mipmap-xxxhdpi\ic_launcher_foreground.png")

# 2. Android Splash Screen Images (White background)
$white = [System.Drawing.Color]::White
CreateResizedPng $srcImg 480 320 0.50 (Join-Path $androidRes "drawable\splash.png") $white
CreateResizedPng $srcImg 480 320 0.50 (Join-Path $androidRes "drawable-land-mdpi\splash.png") $white
CreateResizedPng $srcImg 800 480 0.50 (Join-Path $androidRes "drawable-land-hdpi\splash.png") $white
CreateResizedPng $srcImg 1280 720 0.50 (Join-Path $androidRes "drawable-land-xhdpi\splash.png") $white
CreateResizedPng $srcImg 1600 960 0.50 (Join-Path $androidRes "drawable-land-xxhdpi\splash.png") $white
CreateResizedPng $srcImg 1920 1280 0.50 (Join-Path $androidRes "drawable-land-xxxhdpi\splash.png") $white
CreateResizedPng $srcImg 320 480 0.50 (Join-Path $androidRes "drawable-port-mdpi\splash.png") $white
CreateResizedPng $srcImg 480 800 0.50 (Join-Path $androidRes "drawable-port-hdpi\splash.png") $white
CreateResizedPng $srcImg 720 1280 0.50 (Join-Path $androidRes "drawable-port-xhdpi\splash.png") $white
CreateResizedPng $srcImg 960 1600 0.50 (Join-Path $androidRes "drawable-port-xxhdpi\splash.png") $white
CreateResizedPng $srcImg 1280 1920 0.50 (Join-Path $androidRes "drawable-port-xxxhdpi\splash.png") $white

# 3. Web & Desktop Assets (public/favicon.ico)
$faviconPath = Join-Path $publicDir "favicon.ico"
CreateIco $srcImg @(16, 24, 32, 48, 64, 128, 256) $faviconPath

$distClient = Join-Path $rootDir "dist\client"
if (Test-Path $distClient) {
    Copy-Item $logoPath (Join-Path $distClient "logo.png") -Force
    Copy-Item $faviconPath (Join-Path $distClient "favicon.ico") -Force
}

# 4. Base64 icon for Desktop
$desktopAssets = Join-Path $rootDir "src\platform\desktop\assets.ts"
$temp256 = [System.IO.Path]::GetTempFileName() + ".png"
CreateResizedPng $srcImg 256 256 0.95 $temp256
$base64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($temp256))
Remove-Item $temp256 -ErrorAction SilentlyContinue

$assetsContent = "export const APP_ICON_DATA_URL =`n  'data:image/png;base64,$base64'`nexport const TRAY_ICON_DATA_URL = APP_ICON_DATA_URL`n"
Set-Content -Path $desktopAssets -Value $assetsContent -NoNewline
Write-Host "Updated $desktopAssets with new base64 icon data"

$srcImg.Dispose()
Write-Host "All assets generated successfully"
