param(
  [string]$Server = "https://jlr-miner-tracker-production.up.railway.app"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName Microsoft.VisualBasic

$AppRoot = Join-Path $env:LOCALAPPDATA "JLRMinerTracker\Companion"
$ConfigPath = Join-Path $AppRoot "companion.json"
New-Item -ItemType Directory -Force -Path $AppRoot | Out-Null

$script:ExitRequested = $false
$script:Config = $null
$script:LastReported = @{}
$script:FileCache = @{}
$script:LastNotice = ""
$script:ServerOfflineNoticeAt = [datetime]::MinValue

function Show-JlrBalloon([string]$Title,[string]$Message,[int]$Timeout=5000) {
  if(-not $script:Tray){ return }
  $script:Tray.BalloonTipTitle = $Title
  $script:Tray.BalloonTipText = $Message
  $script:Tray.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Info
  $script:Tray.ShowBalloonTip($Timeout)
}

function Protect-JlrToken([string]$Token) {
  $bytes = [Text.Encoding]::UTF8.GetBytes($Token)
  $protected = [Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  return [Convert]::ToBase64String($protected)
}

function Unprotect-JlrToken([string]$ProtectedToken) {
  if([string]::IsNullOrWhiteSpace($ProtectedToken)){ return "" }
  try {
    $bytes = [Convert]::FromBase64String($ProtectedToken)
    $plain = [Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    return [Text.Encoding]::UTF8.GetString($plain)
  } catch { return "" }
}

function Save-JlrConfig {
  $script:Config | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 -Path $ConfigPath
}

function Load-JlrConfig {
  if(Test-Path $ConfigPath) {
    try { return Get-Content -Raw -Path $ConfigPath | ConvertFrom-Json } catch {}
  }
  return [pscustomobject]@{ server=$Server; tokenProtected=""; deviceName=$env:COMPUTERNAME }
}

function Pair-JlrCompanion {
  $nl = [Environment]::NewLine
  $message = "In JLR Miner Tracker open BRAIN > DESKTOP COMPANION and click CREATE PAIR CODE." + $nl + $nl + "Paste the 10-character code here."
  $code = [Microsoft.VisualBasic.Interaction]::InputBox($message,"Pair JLR Tracker Companion","")
  if([string]::IsNullOrWhiteSpace($code)){ return $false }
  $body = @{ code=$code.Trim().ToUpperInvariant(); deviceName=$env:COMPUTERNAME } | ConvertTo-Json
  try {
    $reply = Invoke-RestMethod -Uri ($script:Config.server.TrimEnd("/") + "/api/companion/pair/claim") -Method Post -ContentType "application/json" -Body $body -TimeoutSec 15
    if(-not $reply.token){ throw "JLR did not return a companion token." }
    $script:Config.tokenProtected = Protect-JlrToken ([string]$reply.token)
    $script:Config.deviceName = $env:COMPUTERNAME
    Save-JlrConfig
    $script:StatusItem.Text = "Status: paired"
    Show-JlrBalloon "JLR Tracker Companion" "Paired. Local EVE system changes will now feed Tracker."
    return $true
  } catch {
    [System.Windows.Forms.MessageBox]::Show(
      "Pairing failed." + $nl + $nl + $_.Exception.Message,
      "JLR Tracker Companion",
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Error
    ) | Out-Null
    return $false
  }
}

function Read-JlrLocalLog([string]$Path) {
  $stream = $null
  $reader = $null
  try {
    $stream = New-Object IO.FileStream($Path,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::ReadWrite)
    $reader = New-Object IO.StreamReader($stream,[Text.Encoding]::Unicode,$true)
    $text = $reader.ReadToEnd()
    $listenerMatch = [regex]::Match($text,'(?m)^\s*Listener:\s*(.+?)\s*$')
    $systemMatches = [regex]::Matches($text,'(?m)EVE System\s*>\s*Channel changed to Local\s*:\s*(.+?)\s*$')
    if(-not $listenerMatch.Success -or $systemMatches.Count -eq 0){ return $null }
    $listener = $listenerMatch.Groups[1].Value.Trim()
    $system = $systemMatches[$systemMatches.Count-1].Groups[1].Value.Trim()
    if([string]::IsNullOrWhiteSpace($listener) -or [string]::IsNullOrWhiteSpace($system)){ return $null }
    return [pscustomobject]@{ characterName=$listener; system=$system }
  } catch {
    return $null
  } finally {
    if($reader){ $reader.Dispose() }
    elseif($stream){ $stream.Dispose() }
  }
}

function Get-JlrLocalSnapshots {
  $documents = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::MyDocuments)
  $logDir = Join-Path $documents "EVE\logs\Chatlogs"
  if(-not (Test-Path $logDir)){
    $script:StatusItem.Text = "Status: EVE Chatlogs not found"
    return @()
  }

  $cutoff = (Get-Date).ToUniversalTime().AddHours(-12)
  $files = @(Get-ChildItem -Path $logDir -Filter "Local_*.txt" -File -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTimeUtc -ge $cutoff } |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -First 60)

  $byCharacter = @{}
  foreach($file in $files){
    $fingerprint = [string]$file.Length + ":" + [string]$file.LastWriteTimeUtc.Ticks
    if($script:FileCache[$file.FullName] -eq $fingerprint){ continue }
    $script:FileCache[$file.FullName] = $fingerprint
    $snapshot = Read-JlrLocalLog $file.FullName
    if(-not $snapshot){ continue }
    if(-not $byCharacter.ContainsKey($snapshot.characterName)){
      $byCharacter[$snapshot.characterName] = [pscustomobject]@{
        characterName=$snapshot.characterName
        system=$snapshot.system
        observedAt=$file.LastWriteTimeUtc.ToString("o")
        writeTime=$file.LastWriteTimeUtc
      }
    }
  }
  return @($byCharacter.Values)
}

function Send-JlrLocation($Snapshot) {
  $token = Unprotect-JlrToken ([string]$script:Config.tokenProtected)
  if([string]::IsNullOrWhiteSpace($token)){ return $false }
  $body = @{
    characterName = [string]$Snapshot.characterName
    system = [string]$Snapshot.system
    observedAt = [string]$Snapshot.observedAt
  } | ConvertTo-Json
  try {
    $reply = Invoke-RestMethod -Uri ($script:Config.server.TrimEnd("/") + "/api/companion/location") -Method Post -Headers @{Authorization="Bearer $token"} -ContentType "application/json" -Body $body -TimeoutSec 12
    $script:StatusItem.Text = "Status: " + $reply.characterName + " | " + $reply.system
    if($reply.needsScan){
      $notice = [string]$reply.characterId + ":" + [string]$reply.system
      if($notice -ne $script:LastNotice){
        $script:LastNotice = $notice
        Show-JlrBalloon "JLR Tracker - scan update needed" ($reply.characterName + " entered " + $reply.system + ". Tracker needs a fresh Probe Scanner copy.") 7000
      }
    }
    return $true
  } catch {
    $statusCode = 0
    try { $statusCode = [int]$_.Exception.Response.StatusCode } catch {}
    if($statusCode -eq 401){
      $script:Config.tokenProtected = ""
      Save-JlrConfig
      $script:StatusItem.Text = "Status: pairing revoked"
      Show-JlrBalloon "JLR Tracker Companion" "Pairing was revoked. Use Pair / Re-pair from the tray menu."
      return $false
    }
    $script:StatusItem.Text = "Status: server unavailable"
    if(((Get-Date) - $script:ServerOfflineNoticeAt).TotalMinutes -ge 10){
      $script:ServerOfflineNoticeAt = Get-Date
      Show-JlrBalloon "JLR Tracker Companion" "JLR server is temporarily unreachable. Tracking will retry automatically."
    }
    return $false
  }
}

$script:Config = Load-JlrConfig
if([string]::IsNullOrWhiteSpace([string]$script:Config.server)){ $script:Config.server = $Server }

$script:Tray = New-Object System.Windows.Forms.NotifyIcon
$script:Tray.Icon = [System.Drawing.SystemIcons]::Information
$script:Tray.Text = "JLR Tracker Companion"
$script:Tray.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$script:StatusItem = New-Object System.Windows.Forms.ToolStripMenuItem
$script:StatusItem.Text = "Status: starting"
$script:StatusItem.Enabled = $false
$menu.Items.Add($script:StatusItem) | Out-Null
$openItem = $menu.Items.Add("Open JLR Miner Tracker")
$pairItem = $menu.Items.Add("Pair / Re-pair")
$folderItem = $menu.Items.Add("Open Companion Folder")
$exitItem = $menu.Items.Add("Exit Companion")
$script:Tray.ContextMenuStrip = $menu

$openItem.add_Click({ Start-Process $script:Config.server })
$pairItem.add_Click({ Pair-JlrCompanion | Out-Null })
$folderItem.add_Click({ Start-Process explorer.exe $AppRoot })
$exitItem.add_Click({ $script:ExitRequested = $true })
$script:Tray.add_DoubleClick({ Start-Process $script:Config.server })

if([string]::IsNullOrWhiteSpace((Unprotect-JlrToken ([string]$script:Config.tokenProtected)))){
  Pair-JlrCompanion | Out-Null
}

Show-JlrBalloon "JLR Tracker Companion" "Running in the Windows tray. Watching EVE Local logs for linked toon movement."

try {
  while(-not $script:ExitRequested){
    [System.Windows.Forms.Application]::DoEvents()
    foreach($snapshot in @(Get-JlrLocalSnapshots)){
      $key = [string]$snapshot.characterName
      $value = [string]$snapshot.system
      if($script:LastReported[$key] -eq $value){ continue }
      if(Send-JlrLocation $snapshot){ $script:LastReported[$key] = $value }
    }
    for($i=0;$i -lt 20 -and -not $script:ExitRequested;$i++){
      [System.Windows.Forms.Application]::DoEvents()
      Start-Sleep -Milliseconds 100
    }
  }
} finally {
  $script:Tray.Visible = $false
  $script:Tray.Dispose()
}
