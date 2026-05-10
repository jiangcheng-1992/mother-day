Set-Location -LiteralPath "C:\Users\Admin\Downloads\mother-day"
$node = "C:\Program Files\nodejs\node.exe"
if (-not (Test-Path -LiteralPath $node)) {
  $node = "node"
}
& $node "preview-server.mjs"
