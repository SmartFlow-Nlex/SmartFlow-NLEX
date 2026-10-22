# Registers the Scheduled Task "SmartFlow weather hourly": every hour at :10, fetch_weather_open_meteo.py --write
# adds the hours of weather that finished since the last run, for the 20 NLEX exit points.
#
# Run once, from this folder:
#   powershell -ExecutionPolicy Bypass -File register_weather_task.ps1
# Run it now:   schtasks /Run /TN "SmartFlow weather hourly"
# Remove it:    Unregister-ScheduledTask -TaskName 'SmartFlow weather hourly' -Confirm:$false
#
# Settings, as for "SmartFlow weekly retrain":
#   - StartWhenAvailable: a run missed while the PC was off or asleep starts when it is back. Each run looks back
#     120 days, so the weather table has no holes after downtime, only a delay.
#   - 15-minute limit: a run takes seconds.
#   - IgnoreNew: never two at once (the insert skips existing hours anyway).
#   - It runs as the logged-in user, so it needs that user signed in (the screen may be locked).
# A machine that is always on (the AWS job that already fetches events and Waze) would remove that last condition;
# the script runs there unchanged, given smartflow_scripts/config/.env.
$name = 'SmartFlow weather hourly'
$launcher = Join-Path $PSScriptRoot 'run_weather_hidden.ps1'

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $launcher + '"') `
    -WorkingDirectory $PSScriptRoot
$start = (Get-Date).Date.AddHours((Get-Date).Hour + 1).AddMinutes(10)
$trigger = New-ScheduledTaskTrigger -Once -At $start -RepetitionInterval (New-TimeSpan -Hours 1)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 15) -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Force `
    -Description 'SmartFlow NLEX: hourly weather for the 20 exit points from Open-Meteo into public.hourly_weather (fetch_weather_open_meteo.py). Fills any missing hour of the last 120 days.' | Out-Null

Get-ScheduledTask -TaskName $name | Get-ScheduledTaskInfo | Select-Object TaskName, NextRunTime | Format-List
