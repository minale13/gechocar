$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument '/c cd /d "C:\Users\tg computer\Desktop\getachew" && npm run build > build_output.txt 2>&1'
Register-ScheduledTask -TaskName 'gecho_build' -Action $action -Force | Out-Null
Start-ScheduledTask -TaskName 'gecho_build'
Write-Output 'BUILD STARTED'
