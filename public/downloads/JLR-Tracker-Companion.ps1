param(
  [string]$Server = "https://jlr-miner-tracker-production.up.railway.app"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName Microsoft.VisualBasic
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class JlrObserverWindow {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
}
'@

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
$script:ObserverAllowed = $false
$script:ObserverEnabled = $true
$script:ObserverReady = $false
$script:ObserverOcr = $null
$script:ObserverAwaiter = $null
$script:ObserverNextAt = [datetime]::MinValue
$script:ObserverCandidates = @{}
$script:ObserverLastSent = @{}
$script:ObserverFailureNoticeAt = [datetime]::MinValue
$script:ObserverFramePath = Join-Path $AppRoot "observer-frame.png"

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
  return [pscustomobject]@{ server=$Server; tokenProtected=""; deviceName=$env:COMPUTERNAME; observerEnabled=$true }
}

function Update-JlrObserverUi {
  if(-not $script:ObserverItem){ return }
  if(-not $script:ObserverAllowed){
    $script:ObserverItem.Text = "Probe Observer: owner only"
    $script:ObserverItem.Enabled = $false
    return
  }
  $script:ObserverItem.Enabled = $true
  $script:ObserverItem.Text = if($script:ObserverEnabled){"Probe Observer: ON"}else{"Probe Observer: OFF"}
}

function Initialize-JlrObserverOcr {
  if($script:ObserverReady){ return $true }
  try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $runtimeAssembly = [AppDomain]::CurrentDomain.GetAssemblies() |
      Where-Object { $_.FullName -like "System.Runtime.WindowsRuntime,*" } |
      Select-Object -First 1
    if(-not $runtimeAssembly){ throw "Windows Runtime support is unavailable." }
    $extensions = $runtimeAssembly.GetType("System.WindowsRuntimeSystemExtensions")
    $script:ObserverAwaiter = $extensions.GetMember("GetAwaiter","Method","Public,Static") |
      Where-Object { $_.GetParameters()[0].ParameterType.Name -eq "IAsyncOperation`1" } |
      Select-Object -First 1
    if(-not $script:ObserverAwaiter){ throw "Windows Runtime async helper is unavailable." }
    $script:ObserverOcr = [Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]::TryCreateFromUserProfileLanguages()
    if(-not $script:ObserverOcr){ throw "Windows OCR language support is unavailable." }
    $script:ObserverReady = $true
    return $true
  } catch {
    $script:ObserverReady = $false
    return $false
  }
}

function Invoke-JlrObserverAsync([object]$Operation,[Type]$ResultType) {
  return $script:ObserverAwaiter.MakeGenericMethod($ResultType).Invoke($null,@($Operation)).GetResult()
}

function Update-JlrObserverPermission($Reply) {
  if(-not $Reply){ return }
  $property = $Reply.PSObject.Properties["observerAllowed"]
  if(-not $property){ return }
  $wasAllowed = $script:ObserverAllowed
  $script:ObserverAllowed = [bool]$property.Value
  if($script:ObserverAllowed){ Initialize-JlrObserverOcr | Out-Null }
  Update-JlrObserverUi
  if($script:ObserverAllowed -and -not $wasAllowed){
    Show-JlrBalloon "JLR Probe Observer" "Owner-only observer enabled. It reads only the foreground EVE window and never sends clicks or keys." 6500
  }
}

function Get-JlrForegroundEveCapture {
  $handle = [JlrObserverWindow]::GetForegroundWindow()
  if($handle -eq [IntPtr]::Zero){ return $null }
  [uint32]$processId = 0
  [JlrObserverWindow]::GetWindowThreadProcessId($handle,[ref]$processId) | Out-Null
  if(-not $processId){ return $null }
  try { $process = Get-Process -Id $processId -ErrorAction Stop } catch { return $null }
  $title = [string]$process.MainWindowTitle
  if($process.ProcessName -ne "exefile" -or $title -notmatch "^EVE\s*-\s*(.+)$"){ return $null }
  $characterName = $Matches[1].Trim()
  if([string]::IsNullOrWhiteSpace($characterName)){ return $null }

  $rect = New-Object JlrObserverWindow+RECT
  if(-not [JlrObserverWindow]::GetWindowRect($handle,[ref]$rect)){ return $null }
  $width = [int]($rect.Right-$rect.Left)
  $height = [int]($rect.Bottom-$rect.Top)
  if($width -lt 500 -or $height -lt 350){ return $null }

  $source = New-Object System.Drawing.Bitmap $width,$height
  $graphics = [System.Drawing.Graphics]::FromImage($source)
  try {
    $graphics.CopyFromScreen($rect.Left,$rect.Top,0,0,$source.Size)
  } finally {
    $graphics.Dispose()
  }

  $largest = [Math]::Max($width,$height)
  if($largest -gt 2200){
    $scale = 2200.0/$largest
    $scaledWidth = [Math]::Max(1,[int]($width*$scale))
    $scaledHeight = [Math]::Max(1,[int]($height*$scale))
    $scaled = New-Object System.Drawing.Bitmap $scaledWidth,$scaledHeight
    $draw = [System.Drawing.Graphics]::FromImage($scaled)
    try { $draw.DrawImage($source,0,0,$scaledWidth,$scaledHeight) } finally { $draw.Dispose() }
    $source.Dispose()
    $source = $scaled
  }

  try {
    $source.Save($script:ObserverFramePath,[System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $source.Dispose()
  }
  return [pscustomobject]@{ characterName=$characterName; path=$script:ObserverFramePath }
}

function Read-JlrObserverText($Capture) {
  if(-not $Capture -or -not (Initialize-JlrObserverOcr)){ return "" }
  $stream = $null
  $bitmap = $null
  try {
    $fileOperation = [Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]::GetFileFromPathAsync([string]$Capture.path)
    $file = Invoke-JlrObserverAsync $fileOperation ([Windows.Storage.StorageFile])
    $stream = Invoke-JlrObserverAsync ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    $decoderOperation = [Windows.Graphics.Imaging.BitmapDecoder,Windows.Foundation,ContentType=WindowsRuntime]::CreateAsync($stream)
    $decoder = Invoke-JlrObserverAsync $decoderOperation ([Windows.Graphics.Imaging.BitmapDecoder])
    $bitmap = Invoke-JlrObserverAsync ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $result = Invoke-JlrObserverAsync ($script:ObserverOcr.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
    return (@($result.Lines | ForEach-Object { ([string]$_.Text).Trim() } | Where-Object { $_ }) -join [Environment]::NewLine)
  } catch {
    return ""
  } finally {
    if($bitmap){ try{$bitmap.Dispose()}catch{} }
    if($stream){ try{$stream.Dispose()}catch{} }
  }
}

function Get-JlrProbeObserverPayload([string]$Text) {
  if([string]::IsNullOrWhiteSpace($Text)){ return "" }
  $rows = @($Text -split "\r?\n" | ForEach-Object { $_.Trim() } | Where-Object {
    $_ -and (
      $_ -match "(?i)probe\s*scanner" -or
      $_ -match "(?i)cosmic\s+(?:anomaly|signature)" -or
      $_ -match "(?i)ore\s+site" -or
      $_ -match "(?i)deposit|reservoir|rare\s+asteroids|ice\s+(?:field|belt|site)" -or
      $_ -match "\b\d+(?:\.\d+)?\s*%" -or
      $_ -match "(?i)\b\d+(?:\.\d+)?\s*(?:m|km|au)\b" -or
      $_ -match "(?i)^[a-z0-9]{3}-\d{3}\b"
    )
  })
  if($rows.Count -lt 3){ return "" }
  $joined = $rows -join [Environment]::NewLine
  $hasScannerIdentity = $joined -match "(?i)probe\s*scanner|cosmic\s+(?:anomaly|signature)|ore\s+site"
  $hasMeasurement = $joined -match "\b\d+(?:\.\d+)?\s*%" -or $joined -match "(?i)\b\d+(?:\.\d+)?\s*(?:m|km|au)\b"
  if(-not $hasScannerIdentity -or -not $hasMeasurement){ return "" }
  return $joined
}

function Get-JlrObserverHash([string]$Text) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes(($Text -replace "\s+"," ").Trim().ToLowerInvariant())
    return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace("-","")
  } finally {
    $sha.Dispose()
  }
}

function Send-JlrObservedProbeScan([string]$CharacterName,[string]$System,[string]$Text) {
  if([string]::IsNullOrWhiteSpace($script:AuthToken)){ return $false }
  $body = @{ characterName=$CharacterName; system=$System; text=$Text } | ConvertTo-Json
  try {
    $reply = Invoke-RestMethod -Uri ($script:Config.server.TrimEnd("/") + "/api/companion/scan") -Method Post -Headers @{Authorization="Bearer $script:AuthToken"} -ContentType "application/json" -Body $body -TimeoutSec 20
    Update-JlrObserverPermission $reply
    if($reply.system){
      $script:StatusItem.Text = "Status: observer updated " + [string]$reply.system
    }
    return $true
  } catch {
    $statusCode = 0
    try { $statusCode = [int]$_.Exception.Response.StatusCode } catch {}
    if($statusCode -eq 403){
      $script:ObserverAllowed = $false
      Update-JlrObserverUi
      return $false
    }
    if($statusCode -eq 401){ Handle-JlrSendFailure $_; return $false }
    return $false
  }
}

function Invoke-JlrProbeObserver {
  if(-not $script:ObserverAllowed -or -not $script:ObserverEnabled){ return }
  $capture = Get-JlrForegroundEveCapture
  if(-not $capture){ return }
  $snapshot = $script:LatestSnapshots[[string]$capture.characterName]
  if(-not $snapshot -or [string]::IsNullOrWhiteSpace([string]$snapshot.system)){ return }

  $ocrText = Read-JlrObserverText $capture
  $payload = Get-JlrProbeObserverPayload $ocrText
  if([string]::IsNullOrWhiteSpace($payload)){ return }

  $system = [string]$snapshot.system
  $key = ([string]$capture.characterName) + "|" + $system
  $hash = Get-JlrObserverHash $payload
  if($script:ObserverLastSent[$key] -eq $hash){ return }

  $candidate = $script:ObserverCandidates[$key]
  if(-not $candidate -or [string]$candidate.hash -ne $hash){
    $script:ObserverCandidates[$key] = [pscustomobject]@{ hash=$hash; count=1 }
    return
  }
  $candidate.count = [int]$candidate.count + 1
  if($candidate.count -lt 2){ return }

  if(Send-JlrObservedProbeScan ([string]$capture.characterName) $system $payload){
    $script:ObserverLastSent[$key] = $hash
    $script:ObserverCandidates.Remove($key)
  }
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
    Update-JlrObserverPermission $reply
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
    Update-JlrObserverPermission $reply
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
    Update-JlrObserverPermission $reply
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
if(-not $script:Config.PSObject.Properties["observerEnabled"]){
  $script:Config | Add-Member -NotePropertyName observerEnabled -NotePropertyValue $true
}
$script:ObserverEnabled = [bool]$script:Config.observerEnabled
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
$script:ObserverItem = $menu.Items.Add("Probe Observer: checking")
$folderItem = $menu.Items.Add("Open Companion Folder")
$exitItem = $menu.Items.Add("Exit Companion")
$script:Tray.ContextMenuStrip = $menu

$openItem.add_Click({ Start-Process $script:Config.server })
$pairItem.add_Click({ Pair-JlrCompanion | Out-Null })
$script:ObserverItem.add_Click({
  if(-not $script:ObserverAllowed){ return }
  $script:ObserverEnabled = -not $script:ObserverEnabled
  $script:Config.observerEnabled = $script:ObserverEnabled
  Save-JlrConfig
  Update-JlrObserverUi
})
$folderItem.add_Click({ Start-Process explorer.exe $AppRoot })
$exitItem.add_Click({ $script:ExitRequested = $true })
$script:Tray.add_DoubleClick({ Start-Process $script:Config.server })
Update-JlrObserverUi

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
    if($script:ObserverAllowed -and $script:ObserverEnabled -and (Get-Date) -ge $script:ObserverNextAt){
      $script:ObserverNextAt = (Get-Date).AddSeconds(3)
      try { Invoke-JlrProbeObserver } catch {
        if(((Get-Date) - $script:ObserverFailureNoticeAt).TotalMinutes -ge 10){
          $script:ObserverFailureNoticeAt = Get-Date
          Show-JlrBalloon "JLR Probe Observer" "Screen reading hit an error and will keep retrying. EVE input was not touched."
        }
      }
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
