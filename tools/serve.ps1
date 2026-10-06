param(
    [ValidateRange(0, 65535)][int]$Port = 8000,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$rootPrefix = $root.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
$listener = $null

# A loopback TCP listener needs no HTTP.sys URL reservation or admin rights.
# Try nearby ports first, then let Windows choose an available port.
for ($attempt = 0; $attempt -le 20; $attempt++) {
    $candidatePort = if ($Port -eq 0 -or $attempt -eq 20 -or ($Port + $attempt) -gt 65535) { 0 } else { $Port + $attempt }
    $candidateListener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $candidatePort)
    try {
        $candidateListener.Server.ExclusiveAddressUse = $true
        $candidateListener.Start()
        $listener = $candidateListener
        break
    } catch {
        $candidateListener.Stop()
        if ($attempt -eq 20 -or $Port -eq 0) {
            Write-Host 'Could not start the local CHERM server.' -ForegroundColor Red
            Write-Host $_.Exception.Message
            exit 1
        }
    }
}

$actualPort = $listener.LocalEndpoint.Port
$url = "http://127.0.0.1:$actualPort/"
if ($Port -ne 0 -and $actualPort -ne $Port) { Write-Host "Port $Port is unavailable; using $actualPort." }
Write-Host "CHERM Hazard Simulator running at $url"
Write-Host 'Keep this window open while using the app. Press Ctrl+C to stop.'
if (-not $NoBrowser) {
    try { Start-Process $url } catch { Write-Host "Open $url in your browser. Automatic browser launch failed: $($_.Exception.Message)" }
}

$types = @{
    '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'
    '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json; charset=utf-8'
    '.geojson' = 'application/geo+json; charset=utf-8'; '.tif' = 'image/tiff'; '.tiff' = 'image/tiff'
    '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.svg' = 'image/svg+xml'; '.ico' = 'image/x-icon'
}

function Send-Response {
    param(
        [IO.Stream]$Stream, [int]$StatusCode, [string]$Reason,
        [string]$ContentType = 'text/plain; charset=utf-8',
        [byte[]]$Body = @(), [string]$FilePath, [bool]$HeadOnly = $false
    )
    $file = $null
    try {
        if ($FilePath) {
            $file = [IO.File]::OpenRead($FilePath)
            $length = $file.Length
        } else { $length = $Body.Length }
        $header = "HTTP/1.1 $StatusCode $Reason`r`nContent-Type: $ContentType`r`nContent-Length: $length`r`nConnection: close`r`nCache-Control: no-cache`r`n`r`n"
        $headerBytes = [Text.Encoding]::ASCII.GetBytes($header)
        $Stream.Write($headerBytes, 0, $headerBytes.Length)
        if (-not $HeadOnly) {
            if ($file) { $file.CopyTo($Stream, 65536) }
            elseif ($Body.Length) { $Stream.Write($Body, 0, $Body.Length) }
        }
        $Stream.Flush()
    } finally { if ($file) { $file.Dispose() } }
}

try {
    while ($true) {
        $client = $listener.AcceptTcpClient()
        $stream = $null
        $reader = $null
        try {
            $stream = $client.GetStream()
            $stream.ReadTimeout = 5000
            $stream.WriteTimeout = 30000
            $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::ASCII, $false, 4096, $true)
            $requestLine = $reader.ReadLine()
            if (-not $requestLine) { continue }
            $parts = $requestLine -split ' ', 3
            if ($parts.Length -ne 3) {
                Send-Response -Stream $stream -StatusCode 400 -Reason 'Bad Request'
                continue
            }
            # Consume request headers; one connection serves one local request.
            for ($headerCount = 0; $headerCount -lt 100; $headerCount++) {
                $line = $reader.ReadLine()
                if ([string]::IsNullOrEmpty($line)) { break }
            }
            $headOnly = $parts[0] -eq 'HEAD'
            if ($parts[0] -ne 'GET' -and -not $headOnly) {
                Send-Response -Stream $stream -StatusCode 405 -Reason 'Method Not Allowed'
                continue
            }
            $relative = [Uri]::UnescapeDataString(($parts[1] -split '\?', 2)[0]).TrimStart('/')
            if ([string]::IsNullOrWhiteSpace($relative)) { $relative = 'index.html' }
            $candidate = [IO.Path]::GetFullPath((Join-Path $root $relative))
            if (-not $candidate.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase) -or -not [IO.File]::Exists($candidate)) {
                Send-Response -Stream $stream -StatusCode 404 -Reason 'Not Found' -Body ([Text.Encoding]::UTF8.GetBytes('Not found')) -HeadOnly $headOnly
                continue
            }
            $ext = [IO.Path]::GetExtension($candidate).ToLowerInvariant()
            $contentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' }
            Send-Response -Stream $stream -StatusCode 200 -Reason 'OK' -ContentType $contentType -FilePath $candidate -HeadOnly $headOnly
        } catch {
            # A closed browser connection must not stop the static server.
            Write-Host "Request interrupted: $($_.Exception.Message)"
        } finally {
            if ($reader) { $reader.Dispose() }
            if ($stream) { $stream.Dispose() }
            $client.Close()
        }
    }
} finally { $listener.Stop() }
