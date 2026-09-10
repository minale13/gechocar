$l = (Get-Content 'c:\Users\tg computer\admas\components\admin\tickets-tab.tsx')[498]
Write-Output ('RAW: ' + $l)
$bytes = [System.Text.Encoding]::UTF8.GetBytes($l)
Write-Output ('LEN: ' + $bytes.Length)
foreach ($b in $bytes) { Write-Output -NoNewline ($b.ToString('X2') + ' ') }
Write-Output ''