$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$target = Join-Path $root '启动滴答清单.cmd'
$icon = Join-Path $root 'assets\app.ico'
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop '滴答清单.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $target
$shortcut.WorkingDirectory = $root
$shortcut.IconLocation = "$icon,0"
$shortcut.Description = '滴答 · 本地清单'
$shortcut.Save()
Write-Host "已创建桌面快捷方式：$shortcutPath"
Start-Sleep -Seconds 2
