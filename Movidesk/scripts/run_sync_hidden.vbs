' Wrapper para rodar sync-movidesk.js sem NENHUMA janela aparecer.
'
' WScript.Shell.Run (mesmo com janela=0) ainda aloca um console real pro
' processo filho (cmd.exe/node.exe) - em algumas versoes do Windows isso
' causa um flash visivel de janela antes de aplicar o estilo oculto.
' WScript.Shell.Exec, em vez disso, conecta a saida do processo via pipes
' (como um popen) e NUNCA cria uma janela de console - por isso trocamos
' pra Exec aqui. Tambem chamamos o node.exe direto, sem passar por cmd.exe,
' pra eliminar mais uma camada onde uma janela poderia aparecer.

Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")

scriptDir = objFSO.GetParentFolderName(WScript.ScriptFullName)
scriptPath = scriptDir & "\sync-movidesk.js"
logPath = scriptDir & "\sync.log"

Set objLog = objFSO.OpenTextFile(logPath, 8, True) ' 8 = ForAppending, cria se nao existir
objLog.WriteLine "============================================"
objLog.WriteLine "Execucao iniciada em " & Now()
objLog.Close

nodeExe = "C:\Program Files\nodejs\node.exe"
cmd = """" & nodeExe & """ """ & scriptPath & """ incremental"
Set objExec = objShell.Exec(cmd)

' Le stdout/stderr conforme chegam e vai gravando no log (Exec e assincrono)
Do While objExec.Status = 0
    Do While Not objExec.StdOut.AtEndOfStream
        line = objExec.StdOut.ReadLine()
        AppendLog logPath, line
    Loop
    Do While Not objExec.StdErr.AtEndOfStream
        line = objExec.StdErr.ReadLine()
        AppendLog logPath, line
    Loop
    WScript.Sleep 200
Loop

' Drena o que sobrou nos buffers depois que o processo terminou
Do While Not objExec.StdOut.AtEndOfStream
    AppendLog logPath, objExec.StdOut.ReadLine()
Loop
Do While Not objExec.StdErr.AtEndOfStream
    AppendLog logPath, objExec.StdErr.ReadLine()
Loop

exitCode = objExec.ExitCode
AppendLog logPath, "Execucao finalizada em " & Now() & " (exit code " & exitCode & ")"

WScript.Quit exitCode

Sub AppendLog(path, text)
    Dim f
    Set f = objFSO.OpenTextFile(path, 8, True)
    f.WriteLine text
    f.Close
End Sub
