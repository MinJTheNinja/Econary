# TESAT 앱 콘텐츠 파이프라인(YTN + 한경)을 매일 09:00에 실행하도록 Windows 작업 스케줄러에 등록한다.
# 슈카월드 작업(07:00)과 같은 Groq 키를 쓰므로 시간을 떨어뜨려 분당 한도 충돌을 줄인다.
# 화면에 아무것도 띄우지 않으므로 pythonw 로 조용히 실행한다. 로그: pipeline\logs\run_YYYYMMDD.log
#
# 실행: powershell -ExecutionPolicy Bypass -File .\pipeline\register_task.ps1

$TaskName = "TesatAppContentPipeline"
$PythonwPath = "C:\Users\minjo\AppData\Local\Python\pythoncore-3.14-64\pythonw.exe"
$ScriptPath = Join-Path $PSScriptRoot "main.py"

if (-not (Test-Path $PythonwPath)) {
    Write-Error "pythonw.exe 를 찾을 수 없습니다: $PythonwPath"
    exit 1
}

$Action = New-ScheduledTaskAction -Execute $PythonwPath -Argument "`"$ScriptPath`"" -WorkingDirectory $PSScriptRoot
$Trigger = New-ScheduledTaskTrigger -Daily -At 09:00
$Settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings `
    -Principal $Principal -Description "TESAT 앱: YTN·한경 기사 → 단어 연결 → 시사 설명·퀴즈 후보 생성 (매일 09:00)" -Force

Write-Host "등록 완료: '$TaskName' (매일 09:00)"
Write-Host "즉시 실행: Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "삭제: Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false"
