param(
  [Parameter(Mandatory = $true)]
  [string]$MakeDirectory,

  [string]$ProductName = 'AFFiNE-canary',

  [string]$Version = '0.27.5'
)

$ErrorActionPreference = 'Stop'
$MakeDirectory = (Resolve-Path -LiteralPath $MakeDirectory).Path

function Get-RequiredFile {
  param(
    [string]$Directory,
    [string]$Filter,
    [string]$Description
  )

  $found = @(Get-ChildItem -LiteralPath $Directory -Filter $Filter -File -Recurse)
  if ($found.Count -eq 0) {
    throw "Could not find $Description ($Filter) under $Directory"
  }
  if ($found.Count -gt 1) {
    throw "Expected one $Description under $Directory, found $($found.Count)"
  }
  return $found[0]
}

function Wait-ForFile {
  param(
    [string]$Directory,
    [string]$Filter,
    [int]$TimeoutSeconds = 90
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    $file = Get-ChildItem -LiteralPath $Directory -Filter $Filter -File -Recurse -ErrorAction SilentlyContinue |
      Select-Object -First 1
    if ($file) {
      return $file
    }
    Start-Sleep -Seconds 2
  } while ((Get-Date) -lt $deadline)

  throw "Timed out waiting for $Filter under $Directory"
}

function Stop-AppProcesses {
  param([string]$Name)

  Get-Process -Name $Name -ErrorAction SilentlyContinue |
    Stop-Process -Force -ErrorAction SilentlyContinue
}

function Test-AppLaunch {
  param(
    [string]$Executable,
    [string]$Label
  )

  if (-not (Test-Path -LiteralPath $Executable -PathType Leaf)) {
    throw "$Label executable does not exist: $Executable"
  }

  $expectedPath = [System.IO.Path]::GetFullPath($Executable)
  $processName = [System.IO.Path]::GetFileNameWithoutExtension($Executable)
  $profile = Join-Path $env:TEMP "khwarizmi-smoke-$Label-$PID"
  $arguments = "--disable-gpu --user-data-dir=`"$profile`""
  $launcher = Start-Process -FilePath $Executable -ArgumentList $arguments -PassThru -WindowStyle Hidden

  try {
    # Squirrel's application executable can be a bootstrapper: it may exit
    # successfully after handing startup to a child process. Validate the
    # actual process running from this package path, not the bootstrapper PID.
    $deadline = (Get-Date).AddSeconds(30)
    $matchingProcesses = @()
    do {
      $matchingProcesses = @(
        Get-CimInstance Win32_Process -Filter "Name = '$processName.exe'" -ErrorAction SilentlyContinue |
          Where-Object {
            $_.ExecutablePath -and
            [System.IO.Path]::GetFullPath($_.ExecutablePath) -ieq $expectedPath
          }
      )
      if ($matchingProcesses.Count -gt 0) {
        Start-Sleep -Seconds 15
        $matchingProcesses = @(
          Get-CimInstance Win32_Process -Filter "Name = '$processName.exe'" -ErrorAction SilentlyContinue |
            Where-Object {
              $_.ExecutablePath -and
              [System.IO.Path]::GetFullPath($_.ExecutablePath) -ieq $expectedPath
            }
        )
        break
      }
      Start-Sleep -Seconds 1
    } while ((Get-Date) -lt $deadline)

    if ($matchingProcesses.Count -eq 0) {
      $launcher.Refresh()
      $exit = if ($launcher.HasExited) { $launcher.ExitCode } else { 'still running' }
      $candidates = @(
        Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
          Where-Object { $_.Name -ieq "$processName.exe" } |
          Select-Object ProcessId, ParentProcessId, Name, ExecutablePath, CommandLine
      )
      $candidateDetails = if ($candidates.Count -gt 0) {
        ($candidates | ConvertTo-Json -Compress -Depth 3)
      } else {
        'No process with the expected executable name was visible.'
      }
      throw "$Label application process was not found at the packaged executable path (expected: $expectedPath; launcher exit: $exit; process candidates: $candidateDetails)."
    }

    $pids = ($matchingProcesses | ForEach-Object { $_.ProcessId }) -join ', '
    Write-Host "$Label application process remained available for the startup observation window (PID(s): $pids)."
  } finally {
    $matchingProcesses | ForEach-Object {
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
    if (-not $launcher.HasExited) {
      Stop-Process -Id $launcher.Id -Force -ErrorAction SilentlyContinue
    }
    Stop-AppProcesses -Name $processName
  }
}

$tempRoot = Join-Path $env:TEMP "khwarizmi-package-smoke-$PID"
$zipExtract = Join-Path $tempRoot 'zip'
$squirrelInstall = Join-Path $env:LOCALAPPDATA $ProductName
$nsisInstall = Join-Path $env:TEMP "khwarizmi-nsis-install-$PID"

try {
  New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null

  # ZIP: extract the portable package and verify the application starts.
  $zip = Get-RequiredFile -Directory (Join-Path $MakeDirectory 'zip') -Filter '*.zip' -Description 'portable ZIP package'
  Expand-Archive -LiteralPath $zip.FullName -DestinationPath $zipExtract -Force
  $zipApp = Get-RequiredFile -Directory $zipExtract -Filter "$ProductName.exe" -Description 'portable application executable'
  Test-AppLaunch -Executable $zipApp.FullName -Label 'ZIP'

  # Squirrel: validate the installer and update package, install, launch and uninstall.
  $squirrelDirectory = Join-Path $MakeDirectory 'squirrel.windows/x64'
  $squirrelSetup = Get-RequiredFile -Directory $squirrelDirectory -Filter "$ProductName*Setup*.exe" -Description 'Squirrel installer'
  $squirrelPackage = Get-RequiredFile -Directory $squirrelDirectory -Filter '*.nupkg' -Description 'Squirrel NuGet package'
  $releases = Join-Path $squirrelDirectory 'RELEASES'
  if (-not (Test-Path -LiteralPath $releases -PathType Leaf)) {
    throw 'Squirrel RELEASES manifest is missing.'
  }

  # Verify that the Squirrel release manifest points to the generated package.
  $releaseText = Get-Content -LiteralPath $releases -Raw
  if ($releaseText -notmatch [regex]::Escape($squirrelPackage.Name)) {
    throw "Squirrel RELEASES manifest does not reference $($squirrelPackage.Name)."
  }

  if (Test-Path -LiteralPath $squirrelInstall) {
    throw "Squirrel test install directory already exists: $squirrelInstall"
  }
  $squirrelProcess = Start-Process -FilePath $squirrelSetup.FullName -ArgumentList '--silent' -Wait -PassThru
  if ($squirrelProcess.ExitCode -ne 0) {
    throw "Squirrel installer failed with exit code $($squirrelProcess.ExitCode)"
  }
  $squirrelApp = Wait-ForFile -Directory $squirrelInstall -Filter "$ProductName.exe"
  Test-AppLaunch -Executable $squirrelApp.FullName -Label 'Squirrel'

  $updateExe = Wait-ForFile -Directory $squirrelInstall -Filter 'Update.exe'
  $squirrelUninstall = Start-Process -FilePath $updateExe.FullName -ArgumentList '--uninstall -s' -Wait -PassThru
  if ($squirrelUninstall.ExitCode -ne 0) {
    throw "Squirrel uninstall failed with exit code $($squirrelUninstall.ExitCode)"
  }
  Stop-AppProcesses -Name $ProductName

  # NSIS: perform a silent install, launch the installed app, then uninstall.
  $nsisDirectory = Join-Path $MakeDirectory 'nsis.windows/x64'
  $nsisInstaller = Get-RequiredFile -Directory $nsisDirectory -Filter '*.exe' -Description 'NSIS installer'
  if (Test-Path -LiteralPath $nsisInstall) {
    Remove-Item -LiteralPath $nsisInstall -Recurse -Force
  }
  $nsisProcess = Start-Process -FilePath $nsisInstaller.FullName -ArgumentList "/S /D=$nsisInstall" -Wait -PassThru
  if ($nsisProcess.ExitCode -ne 0) {
    throw "NSIS installer failed with exit code $($nsisProcess.ExitCode)"
  }

  $nsisApp = Wait-ForFile -Directory $nsisInstall -Filter "$ProductName.exe"
  Test-AppLaunch -Executable $nsisApp.FullName -Label 'NSIS'

  $uninstaller = Get-ChildItem -LiteralPath $nsisInstall -Filter '*.exe' -File -Recurse |
    Where-Object { $_.Name -match '^(?i:uninstall|unins)' } |
    Select-Object -First 1
  if (-not $uninstaller) {
    throw 'NSIS uninstaller executable was not found in the installation directory.'
  }
  $nsisUninstall = Start-Process -FilePath $uninstaller.FullName -ArgumentList '/S' -Wait -PassThru
  if ($nsisUninstall.ExitCode -ne 0) {
    throw "NSIS uninstall failed with exit code $($nsisUninstall.ExitCode)"
  }
  if (Test-Path -LiteralPath $nsisApp.FullName) {
    throw 'NSIS application executable remains after uninstall.'
  }

  Write-Host 'Windows package smoke tests passed: ZIP, Squirrel install/launch/uninstall, and NSIS install/launch/uninstall.'
} finally {
  Stop-AppProcesses -Name $ProductName
  if (Test-Path -LiteralPath $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
  if (Test-Path -LiteralPath $nsisInstall) {
    Remove-Item -LiteralPath $nsisInstall -Recurse -Force -ErrorAction SilentlyContinue
  }
}
