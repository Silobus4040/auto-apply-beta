# Switch Auto-Apply-Beta to Hetzner Self-Hosted Supabase
$files = @(
    "dashboard.html",
    "job-for-you.html",
    "jobs.html",
    "login.html",
    "onboarding.html",
    "Secret_testing-vault.html",
    "signup.html",
    "swipe.html",
    "verify.html"
)

$cloudUrl = "https://ahpvdcdpwtdeoiatjvnq.supabase.co"
$cloudKey = "sb_publishable_HL0ieV-xdZzKkXIcUPK1MQ_4Unh8e_1"

$hetznerUrl = "https://core-ffnrirrrrnwoo3837q2b9x.myrolerover.com"
$hetznerKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzkzNjM1MjQxLCJleHAiOjE5NTEzMTUyNDF9.fBMO3bKfgpe2o-Y87baP1PHbgN14BBosx75QdAAQL0k"

Write-Host "Creating backup copies and switching to Hetzner..." -ForegroundColor Cyan

foreach ($f in $files) {
    if (Test-Path $f) {
        $backupPath = "$f.cloud_backup"
        if (-not (Test-Path $backupPath)) {
            Copy-Item $f $backupPath
            Write-Host "Created backup: $backupPath" -ForegroundColor DarkGray
        }
        $content = Get-Content $f -Raw
        $content = $content.Replace($cloudUrl, $hetznerUrl).Replace($cloudKey, $hetznerKey)
        Set-Content -Path $f -Value $content -NoNewline
        Write-Host "Updated $f -> Pointing to Hetzner" -ForegroundColor Green
    }
}

Write-Host "`nCutover complete! All frontend files are now pointing to Hetzner." -ForegroundColor Green
Write-Host "To instantly revert to Supabase Cloud at any time, run: .\switch_to_supabase_cloud.ps1" -ForegroundColor Yellow
