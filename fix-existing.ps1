$path = 'c:\Users\tg computer\admas\components\admin\tickets-tab.tsx'
$text = Get-Content -LiteralPath $path -Raw
$old = 'const existingSet = new Set((rows ?? []).map((row) => String(row.ticket_number))));'
$new = 'const existingSet = new Set(saleRows.map((row) => String(row.ticket_number))));'
if ($text.Contains($old)) {
  $text = $text.Replace($old, $new)
  Set-Content -LiteralPath $path -Value $text -NoNewline
  Write-Output 'REPLACED_OK'
} else {
  Write-Output 'OLD_NOT_FOUND'
}