# Setup script for Windows build hosts on GitHub Actions
#
# (C) 2022 Jack Lloyd
# (C) 2022 René Meusel, Rohde & Schwarz Cybersecurity
# (C) 2023 René Fischer, Rohde & Schwarz Cybersecurity
#
# Botan is released under the Simplified BSD License (see license.txt)

param(
    [Parameter()]
    [String]$TARGET,
    [String]$COMPILER,
    [String]$ARCH
)

# Create `sccache` in a CI temp directory
$ciTempDir = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { $env:TEMP }
$sccacheDir = Join-Path -Path $ciTempDir -ChildPath "sccache"

# Extract sccache tarball into sccache dir we just created
New-Item -ItemType Directory -Force -Path $sccacheDir | Out-Null
& python "$PSScriptRoot\download_ci_dep.py" sccache_windows --extract "tar -xzf {file} --strip-components=1 -C `"$sccacheDir`""
if($LASTEXITCODE -ne 0) {
    throw "Failed to download and extract sccache (exit code $LASTEXITCODE)"
}

# Have to set path within this script for later invocations
$env:PATH = "$sccacheDir;$env:PATH"

# Also store in GITHUB_PATH so it's found during the rest of the job
echo "$sccacheDir" >> $env:GITHUB_PATH

# find the sccache cache location and store it in the build job's environment
$raw_cl = (sccache --stats-format json --show-stats | ConvertFrom-Json).cache_location
$cache_location = ([regex] 'Local disk: "(.*)"').Match($raw_cl).groups[1].value
echo "COMPILER_CACHE_LOCATION=$cache_location" >> $env:GITHUB_ENV

# define a build requirements directory (to be populated in setup_gh_actions_after_vcvars.ps1)
$depsdir = Join-Path -Path (Get-Location) -ChildPath dependencies
echo "DEPENDENCIES_LOCATION=$depsdir" >> $env:GITHUB_ENV

# The 3rd-party action (egor-tensin/vs-shell) must be used with 'amd64' to
# request a 64-bit build environment.
$identifiers_for_64bit = @("x86_64", "x64", "amd64")
if($identifiers_for_64bit -contains $ARCH ) {
    echo "VSENV_ARCH=amd64" >> $env:GITHUB_ENV
} else {
    echo "VSENV_ARCH=$ARCH" >> $env:GITHUB_ENV
}

# Remove standalone LLVM (and clang-cl) from PATH - we want to use the one shipped with VS.
# https://github.com/actions/runner-images/issues/10001#issuecomment-2150541007
$no_llvm_path = ($env:PATH -split ';' | Where-Object { $_ -ne 'C:\Program Files\LLVM\bin' }) -join ';'
echo "PATH=$no_llvm_path" >> $env:GITHUB_ENV
