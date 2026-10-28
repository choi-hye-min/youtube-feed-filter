$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$cases = @{
    'main' = $false
    '20260319-143022' = $false
    '2026031-143022-feature' = $false
    '001-feature' = $true
    '20260319-143022-feature' = $true
}

foreach ($helper in @(
    '.specify/scripts/powershell/common.ps1',
    '.specify/extensions/git/scripts/powershell/git-common.ps1'
)) {
    . (Join-Path $repoRoot $helper)
    foreach ($case in $cases.GetEnumerator()) {
        $result = @(Test-FeatureBranch -Branch $case.Key -HasGit $true 3>$null)
        if ($result.Count -ne 1 -or $result[0] -isnot [bool] -or $result[0] -ne $case.Value) {
            throw "Invalid branch validation result: $helper / $($case.Key)"
        }
    }
}
Write-Output 'PowerShell branch validation passed.'
