Option Explicit
Dim shell, fso, folder, cmd
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
If shell.Run("cmd /c node --version", 0, True) <> 0 Then
  MsgBox "Node.js 22+ is required to run JLR locally.", 16, "JLR Miner Tracker"
  WScript.Quit 1
End If
cmd = "cmd /c cd /d """ & folder & """ && node server.mjs > data\server.log 2>&1"
shell.Run cmd, 0, False
WScript.Sleep 1200
shell.Run "http://localhost:3187", 1, False
