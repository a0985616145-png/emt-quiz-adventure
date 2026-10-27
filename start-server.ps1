param(
    [int]$Port = 8080
)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$root = $PSScriptRoot
if (-not $root) { $root = (Get-Location).Path }

$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)
$listener.Start()
Write-Output "======================================================"
Write-Output "🚑 救護知識冒險島 本機預覽伺服器已啟動！"
Write-Output "👉 請打開瀏覽器前往： http://localhost:$Port"
Write-Output "（按 Ctrl+C 可停止伺服器）"
Write-Output "======================================================"

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".md"   = "text/markdown; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".svg"  = "image/svg+xml"
}

try {
    while ($true) {
        $client = $listener.AcceptTcpClient()
        try {
            $stream = $client.GetStream()
            $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
            $requestLine = $reader.ReadLine()
            if ($requestLine) {
                # Consume headers
                while (($h = $reader.ReadLine()) -ne "") { if ($null -eq $h) { break } }
                $parts = $requestLine -split " "
                $rawPath = if ($parts.Length -ge 2) { ($parts[1] -split "\?")[0] } else { "/" }
                if ($rawPath -eq "/") { $rawPath = "/index.html" }
                $relPath = [System.Uri]::UnescapeDataString($rawPath.TrimStart('/')) -replace '/', '\'
                $filePath = Join-Path $root $relPath

                if (Test-Path -LiteralPath $filePath -PathType Leaf) {
                    $ext = [System.IO.Path]::GetExtension($filePath).ToLowerInvariant()
                    $contentType = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { "application/octet-stream" }
                    $body = [System.IO.File]::ReadAllBytes($filePath)
                    $header = "HTTP/1.1 200 OK`r`nContent-Type: $contentType`r`nContent-Length: $($body.Length)`r`nConnection: close`r`nCache-Control: no-cache`r`n`r`n"
                    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
                    $stream.Write($headerBytes, 0, $headerBytes.Length)
                    $stream.Write($body, 0, $body.Length)
                } else {
                    $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
                    $header = "HTTP/1.1 404 Not Found`r`nContent-Type: text/plain; charset=utf-8`r`nContent-Length: $($msg.Length)`r`nConnection: close`r`n`r`n"
                    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
                    $stream.Write($headerBytes, 0, $headerBytes.Length)
                    $stream.Write($msg, 0, $msg.Length)
                }
            }
        } finally {
            $client.Close()
        }
    }
} finally {
    $listener.Stop()
}
