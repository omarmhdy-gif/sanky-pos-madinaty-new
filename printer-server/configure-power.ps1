# Sanky Printer Server - prevent Windows Sleep from killing the server
# when the lid is closed.
#
# WHY THIS IS NEEDED (and why no code change can fix it):
# Closing a laptop's lid triggers Windows Sleep by default, which suspends
# the ENTIRE machine - the CPU halts, every process (including this
# server, no matter how it's run) simply stops executing until the lid is
# reopened. This is an OS-level power state, not an application bug - no
# amount of Node.js/server code can keep a process running through a real
# sleep. The only fix is telling Windows not to sleep when the lid closes,
# which is exactly what this script does.
#
# MUST be run as Administrator (right-click PowerShell, "Run as
# administrator", cd into this folder, then: .\configure-power.ps1).
# Safe to re-run any time.

#Requires -RunAsAdministrator

Write-Host "Configuring Windows power settings so this PC stays on with the lid closed..." -ForegroundColor Cyan

# 1. Lid close action = "Do Nothing", on both AC (plugged in) and battery.
#    This is the actual fix for "stops when I close the lid" - without
#    this, Windows sleeps immediately on lid-close regardless of any other
#    setting below.
Write-Host ""
Write-Host "[1/3] Setting lid-close action to Do Nothing (AC + battery)..."
powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0
powercfg /setdcvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0

# 2. Disable the sleep/standby timeout entirely (AC + battery). The screen
#    can still turn off to save power (that's fine, and unrelated - a
#    blanked display doesn't stop the CPU or network) - this only stops
#    the deeper Sleep state that would otherwise kick in after a period of
#    inactivity even with the lid open.
Write-Host "[2/3] Disabling automatic sleep/standby (screen can still turn off, that's fine)..."
powercfg /change standby-timeout-ac 0
powercfg /change standby-timeout-dc 0
powercfg /change hibernate-timeout-ac 0
powercfg /change hibernate-timeout-dc 0

# 3. Stop Windows from power-managing the network adapter(s) - some
#    Wi-Fi/Ethernet drivers will power down the adapter to save energy even
#    while the PC itself stays awake, which silently drops the printer
#    server off the network (iPads see it as "Offline") without the PC
#    ever actually sleeping. This is the exact "Allow the computer to turn
#    off this device to save power" checkbox in Device Manager's Power
#    Management tab - there is no dedicated NetAdapter cmdlet for it (that
#    checkbox is generic Windows device power management, not
#    network-specific), so it is set the same way Device Manager itself
#    does: via the MSPower_DeviceEnable WMI class, matched to each active
#    adapter's own PnP device ID.
Write-Host "[3/3] Disabling power management on active network adapters..."
$adapters = Get-NetAdapter | Where-Object { $_.Status -eq "Up" }
$deviceEnableEntries = Get-CimInstance -Namespace root\wmi -ClassName MSPower_DeviceEnable
foreach ($adapter in $adapters) {
  $match = $deviceEnableEntries | Where-Object { $_.InstanceName -like "$($adapter.PnPDeviceID)*" }
  if ($match) {
    foreach ($entry in $match) {
      $entry.Enable = $false
      Set-CimInstance -InputObject $entry | Out-Null
    }
    Write-Host ("  - {0}: power management disabled" -f $adapter.Name)
  } else {
    Write-Host ("  - {0}: could not find a matching power-management entry automatically" -f $adapter.Name) -ForegroundColor Yellow
    Write-Host ("    Fix manually: Device Manager, Network adapters, {0}, Properties, Power Management tab, uncheck Allow the computer to turn off this device to save power." -f $adapter.Name) -ForegroundColor Yellow
  }
}

Write-Host ""
Write-Host "Done. This PC will now stay fully on (network included) with the lid closed." -ForegroundColor Green
Write-Host "Keep it plugged into power at all times - Do Nothing on battery still drains the battery while running normally, just without sleeping." -ForegroundColor Yellow
Write-Host "If the Sanky Printer Server is not already installed as a Windows Service, also run 'npm run install-service' (as Administrator) so it survives logout/reboot and restarts itself if it ever crashes." -ForegroundColor Cyan
