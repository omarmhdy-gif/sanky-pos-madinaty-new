param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("Apply", "Remove")]
  [string]$Action,
  [Parameter(Mandatory = $true)]
  [string]$ConfigurationPath,
  [Parameter(Mandatory = $true)]
  [string]$ResultPath
)

$ErrorActionPreference = "Stop"
$marker = "SankyPOS-App-Only"

try {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  if ($identity.User.Value -ne "S-1-5-18") {
    throw "Assigned Access configuration must run as LocalSystem."
  }

  $instance = Get-CimInstance -Namespace "root\cimv2\mdm\dmmap" -ClassName "MDM_AssignedAccess" -ErrorAction Stop
  $current = [System.Net.WebUtility]::HtmlDecode([string]$instance.Configuration)

  if ($Action -eq "Apply") {
    if (-not [string]::IsNullOrWhiteSpace($current) -and $current -notmatch [regex]::Escape($marker)) {
      throw "Another Assigned Access configuration already exists. Sanky left it unchanged."
    }

    $configuration = Get-Content -LiteralPath $ConfigurationPath -Raw -Encoding UTF8
    if ($configuration -notmatch [regex]::Escape($marker)) {
      throw "The Sanky Assigned Access profile marker is missing."
    }
    $instance.Configuration = [System.Net.WebUtility]::HtmlEncode($configuration)
    Set-CimInstance -CimInstance $instance -ErrorAction Stop | Out-Null
  } elseif (-not [string]::IsNullOrWhiteSpace($current)) {
    if ($current -notmatch [regex]::Escape($marker)) {
      throw "The current Assigned Access configuration is not managed by Sanky. Sanky left it unchanged."
    }
    $instance.Configuration = $null
    Set-CimInstance -CimInstance $instance -ErrorAction Stop | Out-Null
  }

  [IO.File]::WriteAllText($ResultPath, '{"ok":true}', [Text.Encoding]::UTF8)
} catch {
  $payload = @{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
  [IO.File]::WriteAllText($ResultPath, $payload, [Text.Encoding]::UTF8)
  exit 1
}
