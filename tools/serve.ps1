param([int]$Port = 8000)
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
try {
  $listener.Start()
} catch {
  Write-Host "Could not start local server on port $Port." -ForegroundColor Red
  Write-Host $_.Exception.Message
  exit 1
}
Start-Process "http://localhost:$Port/"
Write-Host "CHERM Hazard Simulator running at http://localhost:$Port/"
Write-Host "Press Ctrl+C to stop."
$types = @{'.html'='text/html; charset=utf-8';'.js'='text/javascript; charset=utf-8';'.css'='text/css; charset=utf-8';'.json'='application/json';'.geojson'='application/geo+json';'.png'='image/png';'.jpg'='image/jpeg';'.svg'='image/svg+xml'}
while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $relative = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
    if ([string]::IsNullOrWhiteSpace($relative)) { $relative = 'index.html' }
    $candidate = [IO.Path]::GetFullPath((Join-Path $root $relative))
    if (-not $candidate.StartsWith($root) -or -not (Test-Path $candidate -PathType Leaf)) {
      $ctx.Response.StatusCode = 404; $bytes=[Text.Encoding]::UTF8.GetBytes('Not found')
    } else {
      $ext=[IO.Path]::GetExtension($candidate).ToLowerInvariant(); if($types.ContainsKey($ext)){$ctx.Response.ContentType=$types[$ext]}
      $bytes=[IO.File]::ReadAllBytes($candidate); $ctx.Response.StatusCode=200
    }
    $ctx.Response.ContentLength64=$bytes.Length; $ctx.Response.OutputStream.Write($bytes,0,$bytes.Length); $ctx.Response.OutputStream.Close()
  } catch { if($ctx){try{$ctx.Response.Abort()}catch{}} }
}
