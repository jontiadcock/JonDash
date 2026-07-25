# Builds bin\jondash-grant.exe from Program.cs.
#
# Uses the C# compiler that ships INSIDE Windows (.NET Framework 4.x, present on every Win10/11
# install) rather than the .NET SDK. Two reasons, both deliberate:
#   * no toolchain for anyone to install, so the binary is reproducible by any Windows user —
#     a privileged binary nobody can rebuild is a supply-chain smell;
#   * no runtime to ship. The result is ~10 KB, which matters because the updater downloads the
#     git tag archive and has no path to a GitHub Release asset, so anything shipped must be
#     committed to the repo.
#
# Run from anywhere:  powershell -ExecutionPolicy Bypass -File tools\grant\build.ps1
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$src  = Join-Path $PSScriptRoot "Program.cs"
$out  = Join-Path $root "bin\jondash-grant.exe"

$csc = Get-ChildItem "$env:WINDIR\Microsoft.NET\Framework64" -Directory -ErrorAction SilentlyContinue |
       Where-Object { Test-Path (Join-Path $_.FullName "csc.exe") } |
       Sort-Object Name | Select-Object -Last 1
if (-not $csc) { throw "No .NET Framework csc.exe found under $env:WINDIR\Microsoft.NET\Framework64" }

New-Item -ItemType Directory -Force (Split-Path $out) | Out-Null

& (Join-Path $csc.FullName "csc.exe") `
    /nologo /target:exe /platform:x64 /optimize+ /warnaserror+ `
    /out:$out $src
if ($LASTEXITCODE -ne 0) { throw "compile failed" }

$f = Get-Item $out
"built  {0}" -f $out
"size   {0:N0} bytes" -f $f.Length
"sha256 {0}" -f (Get-FileHash $out -Algorithm SHA256).Hash.ToLower()
""
"Commit both the source and the binary. The checksum above belongs in the commit message so the"
"artifact can be verified against a rebuild."
