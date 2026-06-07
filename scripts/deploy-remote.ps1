param(
    [string]$HostName = "129.204.48.16",
    [string]$User = "ubuntu",
    [string]$KeyPath = "$env:USERPROFILE\.ssh\codex_abaiautoplus_129_204_48_16",
    [string]$RemoteDir = "/opt/abaiautoplus",
    [string]$RemoteBackupRoot = "/opt/abaiautoplus-backups",
    [string]$RemoteBaseUrl = "http://127.0.0.1:8000",
    [switch]$DryRun,
    [switch]$SkipLocalChecks,
    [switch]$SkipSmoke,
    [switch]$NoRollbackOnSmokeFailure,
    [switch]$RunElectronChecks,
    [switch]$UseExistingImageRuntime
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path $PSScriptRoot -Parent
$ReleaseId = Get-Date -Format "yyyyMMdd-HHmmss"
$PackagePath = Join-Path $env:TEMP "superautoplus-deploy-$ReleaseId.tgz"
$RemotePackage = "/tmp/superautoplus-deploy-$ReleaseId.tgz"
$Target = "$User@$HostName"
$RemoteBackupCreated = $false
$RemoteInstallStarted = $false

function Invoke-Checked {
    param(
        [string]$File,
        [string[]]$Arguments,
        [string]$WorkingDirectory = $RepoRoot
    )
    Write-Output ("+ {0} {1}" -f $File, ($Arguments -join " "))
    Push-Location $WorkingDirectory
    try {
        & $File @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "Command failed with exit code ${LASTEXITCODE}: $File"
        }
    }
    finally {
        Pop-Location
    }
}

function Invoke-Ssh {
    param([string]$RemoteCommand)
    $args = @(
        "-i", $KeyPath,
        "-o", "BatchMode=yes",
        "-o", "ConnectTimeout=10",
        "-o", "StrictHostKeyChecking=accept-new",
        $Target,
        $RemoteCommand
    )
    Invoke-Checked -File "ssh" -Arguments $args
}

function Invoke-RemoteScript {
    param([string]$Script)
    $args = @(
        "-i", $KeyPath,
        "-o", "BatchMode=yes",
        "-o", "ConnectTimeout=10",
        "-o", "StrictHostKeyChecking=accept-new",
        $Target,
        "bash", "-s", "--", $RemoteDir, $RemoteBackupRoot, $ReleaseId, $RemotePackage
    )
    Write-Output "+ ssh $Target bash -s -- <script>"
    $Script | & ssh @args
    if ($LASTEXITCODE -ne 0) {
        throw "Remote script failed with exit code $LASTEXITCODE"
    }
}

function Invoke-LocalChecks {
    if ($SkipLocalChecks) {
        Write-Output "Skipping local checks by request."
        return
    }

    $python = Join-Path $RepoRoot ".venv\Scripts\python.exe"
    if (-not (Test-Path -LiteralPath $python)) {
        $python = "python"
    }
    Invoke-Checked -File $python -Arguments @("-m", "pytest") -WorkingDirectory $RepoRoot
    Invoke-Checked -File "npm" -Arguments @("run", "build") -WorkingDirectory (Join-Path $RepoRoot "frontend")
    Invoke-Checked -File "npm" -Arguments @("run", "lint") -WorkingDirectory (Join-Path $RepoRoot "frontend")
    Invoke-LocalApiCheck -Python $python

    if ($RunElectronChecks) {
        Invoke-Checked -File "npm" -Arguments @("run", "build:backend") -WorkingDirectory (Join-Path $RepoRoot "electron")
        Invoke-Checked -File "npm" -Arguments @("run", "build:win") -WorkingDirectory (Join-Path $RepoRoot "electron")
    }
}

function Invoke-LocalApiCheck {
    param([string]$Python)

    $port = 8765
    $oldDisableSolver = $env:ACCOUNT_MANAGER_DISABLE_SOLVER
    $oldPythonPath = $env:PYTHONPATH
    $env:ACCOUNT_MANAGER_DISABLE_SOLVER = "1"
    $env:PYTHONPATH = "src"
    $process = $null

    try {
        $process = Start-Process `
            -FilePath $Python `
            -ArgumentList @("-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", [string]$port) `
            -WorkingDirectory $RepoRoot `
            -WindowStyle Hidden `
            -PassThru

        $deadline = (Get-Date).AddSeconds(45)
        do {
            Start-Sleep -Milliseconds 750
            if ($process.HasExited) {
                throw "Local API process exited before health check passed."
            }
            try {
                $health = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/health" -TimeoutSec 3
                if ($health.ok -eq $true) {
                    Write-Output "Local API health check passed on port $port."
                    return
                }
            }
            catch {
                # Retry until the startup deadline.
            }
        } while ((Get-Date) -lt $deadline)

        throw "Local API health check timed out on port $port."
    }
    finally {
        if ($process -and -not $process.HasExited) {
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
            $process.WaitForExit(5000) | Out-Null
        }
        if ($null -eq $oldDisableSolver) {
            Remove-Item Env:\ACCOUNT_MANAGER_DISABLE_SOLVER -ErrorAction SilentlyContinue
        }
        else {
            $env:ACCOUNT_MANAGER_DISABLE_SOLVER = $oldDisableSolver
        }
        if ($null -eq $oldPythonPath) {
            Remove-Item Env:\PYTHONPATH -ErrorAction SilentlyContinue
        }
        else {
            $env:PYTHONPATH = $oldPythonPath
        }
    }
}

function New-DeployPackage {
    if (Test-Path -LiteralPath $PackagePath) {
        Remove-Item -LiteralPath $PackagePath -Force
    }

    $stagingRoot = Join-Path $env:TEMP "superautoplus-deploy-$ReleaseId"
    if (Test-Path -LiteralPath $stagingRoot) {
        Remove-Item -LiteralPath $stagingRoot -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $stagingRoot | Out-Null

    Write-Output "+ git -c core.quotePath=false ls-files --cached --others --exclude-standard"
    $files = & git -C $RepoRoot -c core.quotePath=false ls-files --cached --others --exclude-standard
    if ($LASTEXITCODE -ne 0) {
        throw "git ls-files failed with exit code $LASTEXITCODE"
    }
    if (-not $files) {
        throw "No files selected for deployment package."
    }

    foreach ($relative in $files) {
        $source = Join-Path $RepoRoot $relative
        if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
            throw "Deploy package source file not found: $relative"
        }
        $destination = Join-Path $stagingRoot $relative
        $destinationDir = Split-Path $destination -Parent
        New-Item -ItemType Directory -Force -Path $destinationDir | Out-Null
        Copy-Item -LiteralPath $source -Destination $destination -Force
    }

    if ($UseExistingImageRuntime) {
        $staticDir = Join-Path $RepoRoot "static"
        $staticIndex = Join-Path $staticDir "index.html"
        if (-not (Test-Path -LiteralPath $staticIndex -PathType Leaf)) {
            throw "UseExistingImageRuntime requires frontend build output at static/index.html."
        }
        Copy-Item -LiteralPath $staticDir -Destination (Join-Path $stagingRoot "static") -Recurse -Force
    }

    $tarArgs = @(
        "-czf", $PackagePath,
        "-C", $stagingRoot,
        "."
    )
    Invoke-Checked -File "tar" -Arguments $tarArgs
    Write-Output "Package created: $PackagePath"
}

function Backup-RemoteDeployment {
    $script = @'
set -euo pipefail
remote_dir="$1"
backup_root="$2"
release_id="$3"
backup_dir="$backup_root/$release_id"
sudo mkdir -p "$backup_dir"
sudo chown "$(id -un):$(id -gn)" "$backup_root" "$backup_dir"
if [ -d "$remote_dir" ]; then
  sudo tar -C "$remote_dir" -czf "$backup_dir/source-no-data.tgz" --exclude='./data' .
  if [ -d "$remote_dir/data" ]; then
    sudo tar -C "$remote_dir" -czf "$backup_dir/data.tgz" data
  fi
fi
echo "backup_dir=$backup_dir"
'@
    Invoke-RemoteScript -Script $script
}

function Publish-RemotePackage {
    $args = @(
        "-i", $KeyPath,
        "-o", "BatchMode=yes",
        "-o", "ConnectTimeout=10",
        "-o", "StrictHostKeyChecking=accept-new",
        $PackagePath,
        "$Target`:$RemotePackage"
    )
    Invoke-Checked -File "scp" -Arguments $args
}

function Install-RemotePackage {
    $script = @'
set -euo pipefail
remote_dir="$1"
backup_root="$2"
release_id="$3"
remote_package="$4"
backup_dir="$backup_root/$release_id"
staging="/tmp/superautoplus-staging-$release_id"

compose() {
  if [ -f compose.override.yml ]; then
    sudo docker compose -f docker-compose.yml -f compose.override.yml "$@"
  else
    sudo docker compose -f docker-compose.yml "$@"
  fi
}

rm -rf "$staging"
mkdir -p "$staging"
tar -xzf "$remote_package" -C "$staging"

if [ -d "$remote_dir" ]; then
  cd "$remote_dir"
  sudo docker image inspect superautoplus-app:latest >/dev/null 2>&1 && sudo docker tag superautoplus-app:latest "superautoplus-app:pre-$release_id" || true
  compose down || true
fi

if [ -d "$remote_dir" ]; then
  sudo rm -rf "$backup_dir/previous-dir"
  sudo mv "$remote_dir" "$backup_dir/previous-dir"
fi

sudo mv "$staging" "$remote_dir"
if [ -d "$backup_dir/previous-dir/data" ]; then
  sudo rm -rf "$remote_dir/data"
  sudo cp -a "$backup_dir/previous-dir/data" "$remote_dir/data"
fi
if [ -f "$backup_dir/previous-dir/.env" ]; then
  sudo cp -a "$backup_dir/previous-dir/.env" "$remote_dir/.env"
fi
if [ -f "$backup_dir/previous-dir/compose.override.yml" ]; then
  sudo cp -a "$backup_dir/previous-dir/compose.override.yml" "$remote_dir/compose.override.yml"
fi

sudo chown -R "$(id -un):$(id -gn)" "$remote_dir"
cd "$remote_dir"
compose build
compose up -d
compose ps
'@
    Invoke-RemoteScript -Script $script
}

function Install-RemotePackageWithExistingImageRuntime {
    $script = @'
set -euo pipefail
remote_dir="$1"
backup_root="$2"
release_id="$3"
remote_package="$4"
backup_dir="$backup_root/$release_id"
staging="/tmp/superautoplus-staging-$release_id"
image_context="/tmp/superautoplus-image-context-$release_id"

compose() {
  if [ -f compose.override.yml ]; then
    sudo docker compose -f docker-compose.yml -f compose.override.yml "$@"
  else
    sudo docker compose -f docker-compose.yml "$@"
  fi
}

rm -rf "$staging" "$image_context"
mkdir -p "$staging"
tar -xzf "$remote_package" -C "$staging"
if [ ! -f "$staging/static/index.html" ]; then
  echo "runtime image refresh requires static/index.html in package" >&2
  exit 1
fi

if [ -d "$remote_dir" ]; then
  cd "$remote_dir"
  sudo docker image inspect superautoplus-app:latest >/dev/null 2>&1 && sudo docker tag superautoplus-app:latest "superautoplus-app:pre-$release_id" || true
  compose down || true
fi

if [ -d "$remote_dir" ]; then
  sudo rm -rf "$backup_dir/previous-dir"
  sudo mv "$remote_dir" "$backup_dir/previous-dir"
fi

sudo mv "$staging" "$remote_dir"
if [ -d "$backup_dir/previous-dir/data" ]; then
  sudo rm -rf "$remote_dir/data"
  sudo cp -a "$backup_dir/previous-dir/data" "$remote_dir/data"
fi
if [ -f "$backup_dir/previous-dir/.env" ]; then
  sudo cp -a "$backup_dir/previous-dir/.env" "$remote_dir/.env"
fi
if [ -f "$backup_dir/previous-dir/compose.override.yml" ]; then
  sudo cp -a "$backup_dir/previous-dir/compose.override.yml" "$remote_dir/compose.override.yml"
fi

sudo chown -R "$(id -un):$(id -gn)" "$remote_dir"
mkdir -p "$image_context"
cp -a "$remote_dir/main.py" "$remote_dir/docker-entrypoint.sh" "$remote_dir/requirements.txt" "$remote_dir/pytest.ini" "$image_context/"
cp -a "$remote_dir/src" "$image_context/src"
cp -a "$remote_dir/assets" "$image_context/assets"
cp -a "$remote_dir/static" "$image_context/static"
cat > "$image_context/Dockerfile" <<'EOF'
FROM superautoplus-app:latest
WORKDIR /app
ENV PYTHONPATH=/app/src
ARG APP_VERSION=dev
RUN rm -rf /app/api /app/application /app/core /app/customer_portal_api /app/domain /app/infrastructure /app/platforms /app/providers /app/services /app/static
COPY main.py docker-entrypoint.sh requirements.txt pytest.ini ./
COPY src ./src
COPY assets ./assets
COPY static ./static
RUN chmod +x /docker-entrypoint.sh && echo "__version__ = \"${APP_VERSION}\"" > /app/src/core/version.py
ENTRYPOINT ["/docker-entrypoint.sh"]
EOF

sudo docker build --build-arg APP_VERSION="$release_id" -t superautoplus-app:latest "$image_context"
cd "$remote_dir"
compose up -d --no-build --force-recreate
compose ps
'@
    Invoke-RemoteScript -Script $script
}

function Rollback-RemoteDeployment {
    $script = @'
set -euo pipefail
remote_dir="$1"
backup_root="$2"
release_id="$3"
backup_dir="$backup_root/$release_id"
failed_dir="$backup_dir/failed-dir"

compose() {
  if [ -f compose.override.yml ]; then
    sudo docker compose -f docker-compose.yml -f compose.override.yml "$@"
  else
    sudo docker compose -f docker-compose.yml "$@"
  fi
}

if [ ! -d "$backup_dir/previous-dir" ]; then
  echo "rollback source missing: $backup_dir/previous-dir" >&2
  if [ -d "$remote_dir" ]; then
    cd "$remote_dir"
    compose up -d || true
  fi
  exit 1
fi

if [ -d "$remote_dir" ]; then
  cd "$remote_dir"
  compose down || true
  sudo rm -rf "$failed_dir"
  sudo mv "$remote_dir" "$failed_dir"
fi

sudo mv "$backup_dir/previous-dir" "$remote_dir"
sudo chown -R "$(id -un):$(id -gn)" "$remote_dir"
sudo docker image inspect "superautoplus-app:pre-$release_id" >/dev/null 2>&1 && sudo docker tag "superautoplus-app:pre-$release_id" superautoplus-app:latest || true
cd "$remote_dir"
compose up -d
compose ps
'@
    Invoke-RemoteScript -Script $script
}

function Invoke-RemoteSmoke {
    if ($SkipSmoke) {
        Write-Output "Skipping remote smoke by request."
        return $true
    }

    $smoke = Join-Path $PSScriptRoot "remote-smoke.ps1"
    & $smoke -HostName $HostName -User $User -KeyPath $KeyPath -RemoteBaseUrl $RemoteBaseUrl
    return ($LASTEXITCODE -eq 0)
}

if (-not (Test-Path -LiteralPath $KeyPath)) {
    throw "SSH key not found: $KeyPath"
}

Write-Output "SuperAutoplus remote deployment"
Write-Output "Target: $Target"
Write-Output "RemoteDir: $RemoteDir"
Write-Output "ReleaseId: $ReleaseId"
Write-Output "KeyPath: $KeyPath"

if ($DryRun) {
    Write-Output "Dry run only. No local build, upload, remote backup, compose action, smoke, or cleanup will run."
    exit 0
}

try {
    Invoke-LocalChecks
    New-DeployPackage
    Backup-RemoteDeployment
    $RemoteBackupCreated = $true
    Publish-RemotePackage
    $RemoteInstallStarted = $true
    if ($UseExistingImageRuntime) {
        Install-RemotePackageWithExistingImageRuntime
    }
    else {
        Install-RemotePackage
    }

    $smokeOk = Invoke-RemoteSmoke
    if (-not $smokeOk) {
        throw "Remote smoke failed."
    }

    Invoke-Ssh -RemoteCommand "rm -f '$RemotePackage'"
    Write-Output "Deployment finished. ReleaseId=$ReleaseId"
}
catch {
    Write-Output "Deployment failed: $($_.Exception.Message)"
    if ($RemoteBackupCreated -and $RemoteInstallStarted -and -not $NoRollbackOnSmokeFailure) {
        Write-Output "Attempting rollback to previous remote deployment."
        try {
            Rollback-RemoteDeployment
        }
        catch {
            Write-Output "Rollback failed: $($_.Exception.Message)"
        }
    }
    elseif (-not $RemoteBackupCreated -or -not $RemoteInstallStarted) {
        Write-Output "Rollback skipped because the remote deployment was not replaced."
    }
    exit 1
}
