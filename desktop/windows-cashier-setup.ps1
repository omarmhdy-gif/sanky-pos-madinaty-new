param(
  [Parameter(Mandatory = $true)]
  [string]$ApplicationPath,
  [switch]$Remove
)

$ErrorActionPreference = "Stop"
$taskName = "SankyPOS-App-Launch"
$userName = "SankyCashier"
$winlogonPath = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon"
$logDirectory = Join-Path $env:ProgramData "SankyPOS"
$logPath = Join-Path $logDirectory "cashier-setup.log"

function Write-SetupLog([string]$Message) {
  try {
    New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
    Add-Content -LiteralPath $logPath -Value "$(Get-Date -Format o) $Message" -Encoding UTF8
  } catch {
    Write-Warning "Could not write setup log: $($_.Exception.Message)"
  }
}

Write-SetupLog "Starting Sanky POS Windows application account setup. Remove=$Remove; ApplicationPath=$ApplicationPath"

if (-not $Remove -and -not (Test-Path -LiteralPath $ApplicationPath -PathType Leaf)) {
  Write-SetupLog "Setup stopped because the Sanky executable was not found at '$ApplicationPath'."
  throw "Sanky POS executable was not found at '$ApplicationPath'."
}
Write-SetupLog "Sanky executable path verified."

if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-SetupLog "Setup stopped because the installer process is not elevated as an administrator."
  throw "Run the Sanky installer as a Windows administrator to create its dedicated application account."
}
Write-SetupLog "Administrator privileges verified."

$interop = @"
using System;
using System.Runtime.InteropServices;

public static class SankyLsaSecret {
  [StructLayout(LayoutKind.Sequential)]
  private struct UnicodeString {
    public ushort Length;
    public ushort MaximumLength;
    public IntPtr Buffer;
  }

  [StructLayout(LayoutKind.Sequential)]
  private struct ObjectAttributes {
    public uint Length;
    public IntPtr RootDirectory;
    public IntPtr ObjectName;
    public uint Attributes;
    public IntPtr SecurityDescriptor;
    public IntPtr SecurityQualityOfService;
  }

  [DllImport("advapi32.dll")]
  private static extern uint LsaOpenPolicy(IntPtr systemName, ref ObjectAttributes attributes, uint desiredAccess, out IntPtr policyHandle);
  [DllImport("advapi32.dll")]
  private static extern uint LsaStorePrivateData(IntPtr policyHandle, ref UnicodeString keyName, IntPtr privateData);
  [DllImport("advapi32.dll")]
  private static extern uint LsaRetrievePrivateData(IntPtr policyHandle, ref UnicodeString keyName, out IntPtr privateData);
  [DllImport("advapi32.dll")]
  private static extern uint LsaClose(IntPtr policyHandle);
  [DllImport("advapi32.dll")]
  private static extern uint LsaFreeMemory(IntPtr buffer);
  [DllImport("advapi32.dll")]
  private static extern uint LsaNtStatusToWinError(uint status);

  private static UnicodeString MakeString(string value, out IntPtr buffer) {
    buffer = Marshal.StringToHGlobalUni(value);
    return new UnicodeString { Length = checked((ushort)(value.Length * 2)), MaximumLength = checked((ushort)((value.Length + 1) * 2)), Buffer = buffer };
  }

  private static IntPtr OpenPolicy() {
    var attributes = new ObjectAttributes { Length = (uint)Marshal.SizeOf(typeof(ObjectAttributes)) };
    IntPtr policy;
    uint status = LsaOpenPolicy(IntPtr.Zero, ref attributes, 0x24, out policy);
    if (status != 0) throw new InvalidOperationException("LsaOpenPolicy failed: " + LsaNtStatusToWinError(status));
    return policy;
  }

  public static void Store(string name, string value) {
    IntPtr keyBuffer = IntPtr.Zero, valueBuffer = IntPtr.Zero, valueStructBuffer = IntPtr.Zero, policy = IntPtr.Zero;
    try {
      var key = MakeString(name, out keyBuffer);
      var secret = MakeString(value, out valueBuffer);
      valueStructBuffer = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(UnicodeString)));
      Marshal.StructureToPtr(secret, valueStructBuffer, false);
      policy = OpenPolicy();
      uint status = LsaStorePrivateData(policy, ref key, valueStructBuffer);
      if (status != 0) throw new InvalidOperationException("LsaStorePrivateData failed: " + LsaNtStatusToWinError(status));
    } finally {
      if (policy != IntPtr.Zero) LsaClose(policy);
      if (keyBuffer != IntPtr.Zero) Marshal.FreeHGlobal(keyBuffer);
      if (valueBuffer != IntPtr.Zero) Marshal.FreeHGlobal(valueBuffer);
      if (valueStructBuffer != IntPtr.Zero) Marshal.FreeHGlobal(valueStructBuffer);
    }
  }

  public static string Retrieve(string name) {
    IntPtr keyBuffer = IntPtr.Zero, secretBuffer = IntPtr.Zero, policy = IntPtr.Zero;
    try {
      var key = MakeString(name, out keyBuffer);
      policy = OpenPolicy();
      uint status = LsaRetrievePrivateData(policy, ref key, out secretBuffer);
      if (status != 0) return null;
      var secret = (UnicodeString)Marshal.PtrToStructure(secretBuffer, typeof(UnicodeString));
      return Marshal.PtrToStringUni(secret.Buffer, secret.Length / 2);
    } finally {
      if (secretBuffer != IntPtr.Zero) LsaFreeMemory(secretBuffer);
      if (policy != IntPtr.Zero) LsaClose(policy);
      if (keyBuffer != IntPtr.Zero) Marshal.FreeHGlobal(keyBuffer);
    }
  }

  public static void Clear(string name) {
    IntPtr keyBuffer = IntPtr.Zero, policy = IntPtr.Zero;
    try {
      var key = MakeString(name, out keyBuffer);
      policy = OpenPolicy();
      uint status = LsaStorePrivateData(policy, ref key, IntPtr.Zero);
      if (status != 0) throw new InvalidOperationException("LsaStorePrivateData clear failed: " + LsaNtStatusToWinError(status));
    } finally {
      if (policy != IntPtr.Zero) LsaClose(policy);
      if (keyBuffer != IntPtr.Zero) Marshal.FreeHGlobal(keyBuffer);
    }
  }
}
"@

try {
  Add-Type -TypeDefinition $interop -ErrorAction Stop
  Write-SetupLog "LSA secret support initialized."
} catch {
  Write-SetupLog "LSA support initialization failed: $($_.Exception.ToString())"
  throw
}

function Register-CashierLaunchTask {
  $qualifiedUser = "$env:COMPUTERNAME\$userName"
  $action = New-ScheduledTaskAction -Execute $ApplicationPath
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $qualifiedUser
  $principal = New-ScheduledTaskPrincipal -UserId $qualifiedUser -LogonType Interactive -RunLevel Limited
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "Launch Sanky POS when its dedicated Windows application account signs in." -Force | Out-Null
}

function Invoke-SankyAssignedAccess([ValidateSet("Apply", "Remove")][string]$Action) {
  $bridgePath = Join-Path $PSScriptRoot "windows-assigned-access-bridge.ps1"
  if (-not (Test-Path -LiteralPath $bridgePath -PathType Leaf)) {
    throw "The Sanky Windows app-only access helper is missing. Rebuild the installer and try again."
  }

  $configurationPath = Join-Path $logDirectory "assigned-access.xml"
  $resultPath = Join-Path $logDirectory "assigned-access-result.json"
  if ($Action -eq "Apply") {
    $profileId = "{3C1A1C3A-0F87-4B48-94A4-5B813B33B048}"
    $escapedAccount = [System.Security.SecurityElement]::Escape("$env:COMPUTERNAME\$userName")
    $escapedApplicationPath = [System.Security.SecurityElement]::Escape($ApplicationPath)
    $configuration = @"
<?xml version="1.0" encoding="utf-8"?>
<AssignedAccessConfiguration xmlns="http://schemas.microsoft.com/AssignedAccess/2017/config" xmlns:rs5="http://schemas.microsoft.com/AssignedAccess/201810/config" xmlns:v4="http://schemas.microsoft.com/AssignedAccess/2021/config">
  <Profiles>
    <Profile Id="$profileId" Name="SankyPOS-App-Only"><KioskModeApp v4:ClassicAppPath="$escapedApplicationPath" /></Profile>
  </Profiles>
  <Configs>
    <Config><Account>$escapedAccount</Account><DefaultProfile Id="$profileId" /></Config>
  </Configs>
</AssignedAccessConfiguration>
"@
    Set-Content -LiteralPath $configurationPath -Value $configuration -Encoding UTF8
  } else {
    Remove-Item -LiteralPath $configurationPath -Force -ErrorAction SilentlyContinue
    Set-Content -LiteralPath $configurationPath -Value "" -Encoding UTF8
  }

  Remove-Item -LiteralPath $resultPath -Force -ErrorAction SilentlyContinue
  $taskName = "SankyPOS-AssignedAccess-Configure"
  $powershellPath = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
  $arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$bridgePath`" -Action $Action -ConfigurationPath `"$configurationPath`" -ResultPath `"$resultPath`""
  $existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($existingTask -and (($existingTask.Actions | ForEach-Object { $_.Arguments }) -notmatch [regex]::Escape($bridgePath))) {
    throw "A Windows task named '$taskName' already exists and is not managed by Sanky. It was left unchanged."
  }

  try {
    $taskAction = New-ScheduledTaskAction -Execute $powershellPath -Argument $arguments
    $taskPrincipal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    Register-ScheduledTask -TaskName $taskName -Action $taskAction -Principal $taskPrincipal -Force | Out-Null
    Start-ScheduledTask -TaskName $taskName

    for ($attempt = 0; $attempt -lt 60 -and -not (Test-Path -LiteralPath $resultPath -PathType Leaf); $attempt++) {
      Start-Sleep -Seconds 1
    }
    if (-not (Test-Path -LiteralPath $resultPath -PathType Leaf)) {
      $taskInfo = Get-ScheduledTaskInfo -TaskName $taskName
      throw "Windows could not apply the app-only access profile (task result $($taskInfo.LastTaskResult))."
    }
    $result = Get-Content -LiteralPath $resultPath -Raw | ConvertFrom-Json
    if (-not $result.ok) { throw [string]$result.error }
    Write-SetupLog "Windows Assigned Access $Action completed successfully."
  } finally {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $configurationPath, $resultPath -Force -ErrorAction SilentlyContinue
  }
}

function New-CashierWindowsAccount([string]$Password) {
  $computer = [ADSI]"WinNT://$env:COMPUTERNAME,computer"
  $newUser = $null
  try {
    $newUser = $computer.Create("user", $userName)
    $newUser.SetPassword($Password)
    $newUser.Put("FullName", "Sanky POS")
    $newUser.Put("Description", "Dedicated Windows sign-in for the Sanky POS application")
    $newUser.Put("UserFlags", 0x10000)
    $newUser.SetInfo()

    $usersGroup = [ADSI]"WinNT://$env:COMPUTERNAME/Users,group"
    $usersGroup.Add($newUser.Path)

    $netExe = Join-Path $env:WINDIR "System32\net.exe"
    & $netExe user $userName /passwordchg:no /expires:never | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "Windows could not apply the application account password policy (net.exe exit code $LASTEXITCODE)."
    }
  } catch {
    try { $computer.Delete("user", $userName) } catch { }
    throw
  } finally {
    if ($newUser) { $newUser.Dispose() }
    if ($computer) { $computer.Dispose() }
  }
}

function Remove-CashierWindowsAccount {
  $computer = [ADSI]"WinNT://$env:COMPUTERNAME,computer"
  try { $computer.Delete("user", $userName) } finally { $computer.Dispose() }
}

function Set-ExistingCashierPassword([string]$Password) {
  $existingUser = [ADSI]"WinNT://$env:COMPUTERNAME/$userName,user"
  try {
    $existingUser.RefreshCache(@("Description"))
    $description = [string]$existingUser.Description.Value
    if ($description -notin @("Dedicated Windows sign-in for Sanky POS", "Dedicated Windows sign-in for the Sanky POS application")) {
      throw "A Windows account named '$userName' exists but is not marked as a Sanky POS application account. Sanky left it unchanged."
    }
    $existingUser.SetPassword($Password)
    $existingUser.Put("FullName", "Sanky POS")
    $existingUser.Put("Description", "Dedicated Windows sign-in for the Sanky POS application")
    $existingUser.SetInfo()
  } finally {
    if ($existingUser) { $existingUser.Dispose() }
  }
}

if ($Remove) {
  try {
    Invoke-SankyAssignedAccess -Action Remove
  } catch {
    Write-SetupLog "Could not remove Sanky's Windows app-only access profile: $($_.Exception.ToString())"
    throw
  }
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName "SankyPOS-Cashier-Launch" -Confirm:$false -ErrorAction SilentlyContinue
  $settings = Get-ItemProperty -LiteralPath $winlogonPath
  if ($settings.DefaultUserName -eq $userName -and $settings.DefaultDomainName -eq $env:COMPUTERNAME) {
    Set-ItemProperty -LiteralPath $winlogonPath -Name AutoAdminLogon -Value "0"
    Remove-ItemProperty -LiteralPath $winlogonPath -Name DefaultUserName, DefaultDomainName -ErrorAction SilentlyContinue
  }
  Write-Output "Automatic sign-in and Sanky startup were removed. The dedicated Windows application account, password secret, and profile were left intact."
  Write-SetupLog "Removed automatic sign-in and application startup task."
  exit 0
}

try {
  $winlogon = Get-ItemProperty -LiteralPath $winlogonPath -ErrorAction Stop
  Write-SetupLog "Windows sign-in settings read successfully. AutoAdminLogon=$($winlogon.AutoAdminLogon); User=$($winlogon.DefaultUserName); Domain=$($winlogon.DefaultDomainName)"
} catch {
  Write-SetupLog "Could not read Windows sign-in settings: $($_.Exception.ToString())"
  throw
}
if ($winlogon.AutoAdminLogon -eq "1" -and ($winlogon.DefaultUserName -ne $userName -or $winlogon.DefaultDomainName -ne $env:COMPUTERNAME)) {
  Write-SetupLog "Setup stopped because automatic sign-in is already configured for another Windows account."
  throw "Windows already has automatic sign-in configured for another account. Sanky did not change it."
}

$createdAccount = $false
$createdSecret = $false
$preserveSecret = $false
$assignedAccessApplied = $false
try {
  Write-SetupLog "Checking for the dedicated Windows application account by security identity."
  $accountExists = $false
  try {
    [void]([System.Security.Principal.NTAccount]"$env:COMPUTERNAME\$userName").Translate([System.Security.Principal.SecurityIdentifier])
    $accountExists = $true
  } catch {
    if ($_.Exception.InnerException -isnot [System.Security.Principal.IdentityNotMappedException]) { throw }
  }
  Write-SetupLog "Sanky POS application account exists: $accountExists"

  if (-not $accountExists) {
    Add-Type -AssemblyName System.Web
    $password = [System.Web.Security.Membership]::GeneratePassword(40, 10)
    New-CashierWindowsAccount -Password $password
    $createdAccount = $true
    [SankyLsaSecret]::Store("DefaultPassword", $password)
    $createdSecret = $true
    $password = $null
  } elseif (-not [SankyLsaSecret]::Retrieve("DefaultPassword")) {
    Add-Type -AssemblyName System.Web
    $password = [System.Web.Security.Membership]::GeneratePassword(40, 10)
    Set-ExistingCashierPassword -Password $password
    [SankyLsaSecret]::Store("DefaultPassword", $password)
    $password = $null
    $preserveSecret = $true
    Write-SetupLog "Recovered the existing dedicated application account and stored a fresh automatic sign-in secret."
  }

  Invoke-SankyAssignedAccess -Action Apply
  $assignedAccessApplied = $true
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
  Set-ItemProperty -LiteralPath $winlogonPath -Name DefaultUserName -Value $userName
  Set-ItemProperty -LiteralPath $winlogonPath -Name DefaultDomainName -Value $env:COMPUTERNAME
  Remove-ItemProperty -LiteralPath $winlogonPath -Name DefaultPassword -ErrorAction SilentlyContinue
  Set-ItemProperty -LiteralPath $winlogonPath -Name AutoAdminLogon -Value "1"
  Write-Output "The Sanky POS Windows application account is locked to the POS app. Use Ctrl+Alt+Delete, then Switch user, to sign in to another Windows account. Restart Windows to start Sanky automatically."
  Write-SetupLog "Sanky POS app-only Windows account, Assigned Access profile, and automatic sign-in completed successfully."
} catch {
  Write-SetupLog "Setup failed: $($_.Exception.ToString())"
  if ($assignedAccessApplied) {
    try { Invoke-SankyAssignedAccess -Action Remove } catch { Write-SetupLog "Could not roll back Assigned Access: $($_.Exception.Message)" }
  }
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
  if ($createdSecret -and -not $preserveSecret) { [SankyLsaSecret]::Clear("DefaultPassword") }
  if ($createdAccount) { try { Remove-CashierWindowsAccount } catch { Write-SetupLog "Could not remove the new application account during rollback: $($_.Exception.Message)" } }
  throw
}
