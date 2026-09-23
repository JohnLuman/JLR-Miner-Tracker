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
$script:AuthToken = ""
$script:LastReported = @{}
$script:LastSentAt = @{}
$script:LatestSnapshots = @{}
$script:FileCache = @{}
$script:TrackedLocalFiles = @()
$script:NextDirectoryRefresh = [datetime]::MinValue
$script:NextServerRetryAt = [datetime]::MinValue
$script:LastNotice = @{}
$script:ServerOfflineNoticeAt = [datetime]::MinValue

function Show-JlrBalloon([string]$Title,[string]$Message,[int]$Timeout=5000) {
  if(-not $script:Tray){ return }
  $script:Tray.BalloonTipTitle = $Title
  $script:Tray.BalloonTipText = $Message
  $script:Tray.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Info
  $script:Tray.ShowBalloonTip($Timeout)
}

function Protect-JlrToken([string]$Token) {
  if([string]::IsNullOrWhiteSpace($Token)){ return "" }
  $secure = ConvertTo-SecureString -String $Token -AsPlainText -Force
  return ConvertFrom-SecureString -SecureString $secure
}

function Unprotect-JlrToken([string]$ProtectedToken) {
  if([string]::IsNullOrWhiteSpace($ProtectedToken)){ return "" }
  try {
    $secure = ConvertTo-SecureString -String $ProtectedToken
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
      return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    } finally {
      if($ptr -ne [IntPtr]::Zero){ [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
    }
  } catch {
    return ""
  }
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
    $script:AuthToken = [string]$reply.token
    $script:Config.tokenProtected = Protect-JlrToken $script:AuthToken
    $script:Config.deviceName = $env:COMPUTERNAME
    $script:NextServerRetryAt = [datetime]::MinValue
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

function Read-JlrUtf16Slice($Stream,[long]$Start,[int]$Count) {
  if($Count -le 0){ return "" }
  $buffer = New-Object byte[] $Count
  $Stream.Position = $Start
  $total = 0
  while($total -lt $Count){
    $read = $Stream.Read($buffer,$total,$Count-$total)
    if($read -le 0){ break }
    $total += $read
  }
  if($total -le 0){ return "" }
  return [System.Text.Encoding]::Unicode.GetString($buffer,0,$total)
}

function Read-JlrLocalLog([string]$Path) {
  $stream = $null
  $reader = $null
  try {
    $stream = New-Object IO.FileStream($Path,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::ReadWrite)
    $length = [long]$stream.Length
    if($length -le 0){ return $null }

    # Listener is near the header; the latest system change is normally near the tail.
    # Avoid rereading a many-megabyte Local log on every chat-line write.
    $headCount = [int][Math]::Min(16384,$length)
    $head = Read-JlrUtf16Slice $stream 0 $headCount
    $tailStart = [long][Math]::Max(0,$length-65536)
    if(($tailStart % 2) -ne 0){ $tailStart-- }
    $tailCount = [int]($length-$tailStart)
    $tail = Read-JlrUtf16Slice $stream $tailStart $tailCount

    $listenerMatch = [regex]::Match($head,'(?m)^\s*Listener:\s*(.+?)\s*$')
    $systemMatches = [regex]::Matches($tail,'(?m)EVE System\s*>\s*Channel changed to Local\s*:\s*(.+?)\s*$')

    # Preserve old behavior for unusual/very noisy logs where the useful line
    # fell outside the fast slices.
    if(-not $listenerMatch.Success -or $systemMatches.Count -eq 0){
      $stream.Position = 0
      $reader = New-Object IO.StreamReader($stream,[System.Text.Encoding]::Unicode,$true)
      $text = $reader.ReadToEnd()
      $listenerMatch = [regex]::Match($text,'(?m)^\s*Listener:\s*(.+?)\s*$')
      $systemMatches = [regex]::Matches($text,'(?m)EVE System\s*>\s*Channel changed to Local\s*:\s*(.+?)\s*$')
    }

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

  $now = Get-Date
  $cutoff = $now.ToUniversalTime().AddHours(-12)
  if($script:TrackedLocalFiles.Count -eq 0 -or $now -ge $script:NextDirectoryRefresh){
    $script:TrackedLocalFiles = @(Get-ChildItem -Path $logDir -Filter "Local_*.txt" -File -ErrorAction SilentlyContinue |
      Where-Object { $_.LastWriteTimeUtc -ge $cutoff } |
      Sort-Object LastWriteTimeUtc -Descending |
      Select-Object -First 60)
    $script:NextDirectoryRefresh = $now.AddSeconds(10)
  }

  $files = @()
  foreach($tracked in @($script:TrackedLocalFiles)){
    try {
      $tracked.Refresh()
      if($tracked.Exists){ $files += $tracked }
    } catch {}
  }

  foreach($file in $files){
    $fingerprint = [string]$file.Length + ":" + [string]$file.LastWriteTimeUtc.Ticks
    if($script:FileCache[$file.FullName] -eq $fingerprint){ continue }
    $script:FileCache[$file.FullName] = $fingerprint
    $snapshot = Read-JlrLocalLog $file.FullName
    if(-not $snapshot){ continue }
    $candidate = [pscustomobject]@{
      characterName=$snapshot.characterName
      system=$snapshot.system
      observedAt=$file.LastWriteTimeUtc.ToString("o")
      writeTime=$file.LastWriteTimeUtc
    }
    $existing = $script:LatestSnapshots[$snapshot.characterName]
    if(-not $existing -or $candidate.writeTime -gt $existing.writeTime){
      $script:LatestSnapshots[$snapshot.characterName] = $candidate
    }
  }
  return @($script:LatestSnapshots.Values)
}

function Handle-JlrLocationReply($Reply) {
  if(-not $Reply){ return }
  $noticeKey = [string]$Reply.characterId
  if($Reply.needsScan){
    if($script:LastNotice[$noticeKey] -ne [string]$Reply.system){
      $script:LastNotice[$noticeKey] = [string]$Reply.system
      Show-JlrBalloon "JLR Tracker - scan update needed" ($Reply.characterName + " entered " + $Reply.system + ". Tracker needs a fresh Probe Scanner copy.") 7000
    }
  } else {
    $script:LastNotice.Remove($noticeKey)
  }
}

function Handle-JlrSendFailure($ErrorRecord) {
  $statusCode = 0
  try { $statusCode = [int]$ErrorRecord.Exception.Response.StatusCode } catch {}
  if($statusCode -eq 401){
    $script:AuthToken = ""
    $script:Config.tokenProtected = ""
    Save-JlrConfig
    $script:StatusItem.Text = "Status: pairing revoked"
    Show-JlrBalloon "JLR Tracker Companion" "Pairing was revoked. Use Pair / Re-pair from the tray menu."
    return
  }
  $script:NextServerRetryAt = (Get-Date).AddSeconds(5)
  $script:StatusItem.Text = "Status: server unavailable"
  if(((Get-Date) - $script:ServerOfflineNoticeAt).TotalMinutes -ge 10){
    $script:ServerOfflineNoticeAt = Get-Date
    Show-JlrBalloon "JLR Tracker Companion" "JLR server is temporarily unreachable. Tracking will retry automatically."
  }
}

function Send-JlrLocationLegacy($Snapshot) {
  if([string]::IsNullOrWhiteSpace($script:AuthToken)){ return $false }
  $body = @{
    characterName = [string]$Snapshot.characterName
    system = [string]$Snapshot.system
    observedAt = [string]$Snapshot.observedAt
  } | ConvertTo-Json
  try {
    $reply = Invoke-RestMethod -Uri ($script:Config.server.TrimEnd("/") + "/api/companion/location") -Method Post -Headers @{Authorization="Bearer $script:AuthToken"} -ContentType "application/json" -Body $body -TimeoutSec 12
    Handle-JlrLocationReply $reply
    return $true
  } catch {
    Handle-JlrSendFailure $_
    return $false
  }
}

function Send-JlrLocations($Snapshots) {
  $rows = @($Snapshots)
  if($rows.Count -eq 0){ return $true }
  if([string]::IsNullOrWhiteSpace($script:AuthToken)){ return $false }
  if((Get-Date) -lt $script:NextServerRetryAt){ return $false }

  $locations = @($rows | ForEach-Object {
    @{
      characterName = [string]$_.characterName
      system = [string]$_.system
      observedAt = [string]$_.observedAt
    }
  })
  $body = @{ locations=$locations } | ConvertTo-Json -Depth 4

  try {
    $reply = Invoke-RestMethod -Uri ($script:Config.server.TrimEnd("/") + "/api/companion/locations") -Method Post -Headers @{Authorization="Bearer $script:AuthToken"} -ContentType "application/json" -Body $body -TimeoutSec 12
    $script:NextServerRetryAt = [datetime]::MinValue
    foreach($result in @($reply.results)){ Handle-JlrLocationReply $result }

    # A successful batch counts as a heartbeat for every submitted snapshot,
    # including an unlinked Local log. That prevents a bad row from hot-looping.
    $sentAt = Get-Date
    foreach($snapshot in $rows){
      $key = [string]$snapshot.characterName
      $script:LastReported[$key] = [string]$snapshot.system
      $script:LastSentAt[$key] = $sentAt
    }

    $results = @($reply.results)
    if($results.Count -eq 1){
      $script:StatusItem.Text = "Status: " + $results[0].characterName + " | " + $results[0].system
    } elseif($results.Count -gt 1){
      $script:StatusItem.Text = "Status: " + $results.Count + " toons synced"
    } else {
      $script:StatusItem.Text = "Status: connected"
    }
    return $true
  } catch {
    $statusCode = 0
    try { $statusCode = [int]$_.Exception.Response.StatusCode } catch {}

    # Backward compatibility if a companion updates before the server deployment.
    if($statusCode -eq 404){
      $any = $false
      foreach($snapshot in $rows){
        if(Send-JlrLocationLegacy $snapshot){
          $key = [string]$snapshot.characterName
          $script:LastReported[$key] = [string]$snapshot.system
          $script:LastSentAt[$key] = Get-Date
          $any = $true
        }
      }
      return $any
    }

    Handle-JlrSendFailure $_
    return $false
  }
}

$script:Config = Load-JlrConfig
if([string]::IsNullOrWhiteSpace([string]$script:Config.server)){ $script:Config.server = $Server }
$script:AuthToken = Unprotect-JlrToken ([string]$script:Config.tokenProtected)

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

if([string]::IsNullOrWhiteSpace($script:AuthToken)){
  Pair-JlrCompanion | Out-Null
}

Show-JlrBalloon "JLR Tracker Companion" "Running in the Windows tray. Watching EVE Local logs for linked toon movement."

try {
  while(-not $script:ExitRequested){
    [System.Windows.Forms.Application]::DoEvents()
    $pending = @()
    $checkAt = Get-Date
    foreach($snapshot in @(Get-JlrLocalSnapshots)){
      $key = [string]$snapshot.characterName
      $value = [string]$snapshot.system
      $lastSent = $script:LastSentAt[$key]
      $heartbeatDue = (-not $lastSent) -or (($checkAt - [datetime]$lastSent).TotalSeconds -ge 30)
      if($script:LastReported[$key] -eq $value -and -not $heartbeatDue){ continue }
      $pending += $snapshot
    }
    if($pending.Count -gt 0){ Send-JlrLocations $pending | Out-Null }
    for($i=0;$i -lt 20 -and -not $script:ExitRequested;$i++){
      [System.Windows.Forms.Application]::DoEvents()
      Start-Sleep -Milliseconds 100
    }
  }
} finally {
  $script:Tray.Visible = $false
  $script:Tray.Dispose()
}
