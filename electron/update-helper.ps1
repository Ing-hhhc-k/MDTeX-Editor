param([Parameter(Mandatory=$true)][string]$PlanFile)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$plan = Get-Content -LiteralPath $PlanFile -Raw -Encoding UTF8 | ConvertFrom-Json
$root = [IO.Path]::GetFullPath($plan.root).TrimEnd('\')
$work = [IO.Path]::GetFullPath($plan.work).TrimEnd('\')
$dataRoot = Join-Path $root 'MDTeX-data'
if (!$work.StartsWith($dataRoot + '\updates\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid update directory' }
function CheckedChild([string]$ParentPath, [string]$ChildPath) {
  $resolved = [IO.Path]::GetFullPath($ChildPath)
  if (!$resolved.StartsWith($ParentPath.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Path outside update directory' }
  return $resolved
}
$stage = CheckedChild $work $plan.stage
$backup = CheckedChild $work $plan.backup
$status = CheckedChild $work (Join-Path $work 'status.json')
function Status([string]$state,[string]$message) { @{state=$state;message=$message} | ConvertTo-Json | Set-Content -LiteralPath $status -Encoding UTF8 }
$names = @('_internal','MDTeX.exe','使用说明.md','CHANGELOG.md','ROADMAP.md')
$moved = @(); $installed = @(); $newProcess = $null; $committed = $false
try {
  New-Item -ItemType Directory -Path $backup -Force | Out-Null
  Set-Content -LiteralPath (Join-Path $work 'helper-ready') -Value 'ready'
  if ($plan.parentPid -gt 0) { Wait-Process -Id $plan.parentPid -Timeout 120 -ErrorAction SilentlyContinue; if (Get-Process -Id $plan.parentPid -ErrorAction SilentlyContinue) { throw 'Editor did not exit' } }
  foreach ($name in $names) {
    $target = CheckedChild $root (Join-Path $root $name)
    $old = CheckedChild $backup (Join-Path $backup $name)
    if (Test-Path -LiteralPath $target) {
      for ($attempt=0; ;$attempt++) { try { Move-Item -LiteralPath $target -Destination $old; break } catch { if ($attempt -ge 40) { throw }; Start-Sleep -Milliseconds 250 } }
      $moved += $name
    }
    $source = CheckedChild $stage (Join-Path $stage $name)
    Move-Item -LiteralPath $source -Destination $target
    $installed += $name
  }
  if ($plan.restart) {
    $env:MDTEX_PORTABLE_ROOT = $root
    $newProcess = Start-Process -FilePath (Join-Path $root '_internal\MDTeX.exe') -ArgumentList ('--mdtex-update-token=' + $plan.token) -PassThru
    $marker = Join-Path $work 'booted'
    for ($i=0;$i -lt 120;$i++) { if (Test-Path -LiteralPath $marker) { break }; if ($newProcess.HasExited) { throw 'New editor exited before startup completed' }; Start-Sleep -Milliseconds 500 }
    if (!(Test-Path -LiteralPath $marker)) { throw 'New editor startup timed out' }
    if ((Get-Content -LiteralPath $marker -Raw).Trim() -ne $plan.version) { throw 'New editor version did not match' }
  }
  $committed = $true
  # All recursive removal targets have been resolved and checked above.
  Remove-Item -LiteralPath $backup -Recurse -Force
  Remove-Item -LiteralPath $stage -Recurse -Force
  foreach ($name in @('apply.ps1','plan.json','helper-ready','booted')) { $file=CheckedChild $work (Join-Path $work $name); if(Test-Path -LiteralPath $file){Remove-Item -LiteralPath $file -Force} }
  Status 'success' '更新成功，旧程序文件已清理。'
} catch {
  $message = $_.Exception.Message
  if ($committed) { Status 'success' ('新版已启动，旧程序清理未完成：' + $message); exit 0 }
  try {
    if ($newProcess -and !$newProcess.HasExited) { Stop-Process -Id $newProcess.Id -Force; $newProcess.WaitForExit() }
    foreach ($name in $installed) { $target=CheckedChild $root (Join-Path $root $name); if(Test-Path -LiteralPath $target){ Remove-Item -LiteralPath $target -Recurse -Force } }
    foreach ($name in $moved) { Move-Item -LiteralPath (CheckedChild $backup (Join-Path $backup $name)) -Destination (CheckedChild $root (Join-Path $root $name)) }
    Status 'failed' ('更新失败，已恢复旧版：' + $message)
    if ($plan.restart -and (Test-Path -LiteralPath (Join-Path $root 'MDTeX.exe'))) { Start-Process -FilePath (Join-Path $root 'MDTeX.exe') -ArgumentList ('--mdtex-update-result=' + $plan.token) }
  } catch { Status 'failed' ('需要手动恢复备份：' + $backup + '；' + $message + '；' + $_.Exception.Message) }
}
