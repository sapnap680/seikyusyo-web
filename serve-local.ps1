$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 5500
$prefix = "http://127.0.0.1:$port/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Output "Serving $root at $prefix"
Write-Output "READY"

$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".js"   = "text/javascript; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".svg"  = "image/svg+xml"
  ".ico"  = "image/x-icon"
  ".csv"  = "text/csv; charset=utf-8"
  ".pdf"  = "application/pdf"
}

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $reqPath = [Uri]::UnescapeDataString($ctx.Request.Url.LocalPath)
  if ([string]::IsNullOrWhiteSpace($reqPath) -or $reqPath -eq "/") {
    $reqPath = "/invoice.html"
  }
  $rel = $reqPath.TrimStart("/").Replace("/", [IO.Path]::DirectorySeparatorChar)
  $full = [IO.Path]::GetFullPath((Join-Path $root $rel))
  $rootFull = [IO.Path]::GetFullPath($root)
  if (-not $full.StartsWith($rootFull, [StringComparison]::OrdinalIgnoreCase)) {
    $ctx.Response.StatusCode = 403
    $ctx.Response.Close()
    continue
  }
  if (-not (Test-Path -LiteralPath $full -PathType Leaf)) {
    $ctx.Response.StatusCode = 404
    $bytes = [Text.Encoding]::UTF8.GetBytes("Not Found")
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $ctx.Response.Close()
    continue
  }
  $ext = [IO.Path]::GetExtension($full).ToLowerInvariant()
  $ctx.Response.Headers.Add("Cache-Control", "no-store, no-cache, must-revalidate")
  $ctx.Response.Headers.Add("Pragma", "no-cache")
  $ctx.Response.ContentType = $(if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" })
  $bytes = [IO.File]::ReadAllBytes($full)
  $ctx.Response.ContentLength64 = $bytes.Length
  $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $ctx.Response.Close()
}
