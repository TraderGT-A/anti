Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
batPath = fso.BuildPath(here, "run_set_filed.bat")
shortPath = fso.GetFile(batPath).ShortPath
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c " & shortPath, 0, False
