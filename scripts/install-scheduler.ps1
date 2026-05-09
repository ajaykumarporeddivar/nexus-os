# NEXUS OS — Register daily AI agent task in Windows Task Scheduler
# Run as Administrator: powershell -ExecutionPolicy Bypass -File install-scheduler.ps1

$TaskName = "NEXUS\DailyAgentRun"
$XmlPath  = "$PSScriptRoot\schedule-daily-agent.xml"

# Remove existing task if present
if (Get-ScheduledTask -TaskName "DailyAgentRun" -TaskPath "\NEXUS\" -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName "DailyAgentRun" -TaskPath "\NEXUS\" -Confirm:$false
    Write-Host "Removed existing task."
}

# Create the NEXUS folder in Task Scheduler if it doesn't exist
$scheduler = New-Object -ComObject Schedule.Service
$scheduler.Connect()
$rootFolder = $scheduler.GetFolder("\")
try {
    $rootFolder.GetFolder("NEXUS") | Out-Null
} catch {
    $rootFolder.CreateFolder("NEXUS") | Out-Null
    Write-Host "Created NEXUS folder in Task Scheduler."
}

# Register the task from XML
Register-ScheduledTask -Xml (Get-Content $XmlPath -Raw) -TaskName "DailyAgentRun" -TaskPath "\NEXUS\" -Force
Write-Host ""
Write-Host "✓ Task registered: $TaskName"
Write-Host "  Schedule: Daily at 07:00 AM"
Write-Host "  Script:   D:\NEXUS_NEW\nexus-os\scripts\daily-agent.sh"
Write-Host ""
Write-Host "To run NOW (test): Start-ScheduledTask -TaskName 'DailyAgentRun' -TaskPath '\NEXUS\'"
Write-Host "To view logs:      Get-Content 'D:\NEXUS_NEW\nexus-os\scripts\reports\$(Get-Date -Format yyyy-MM-dd).json'"
