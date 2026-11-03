# INSTANT FALLBACK: Revert Auto-Apply-Beta to Supabase Cloud
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

Write-Host "Reverting all frontend files to Supabase Cloud..." -ForegroundColor Yellow

foreach ($f in $files) {
    $backupPath = "$f.cloud_backup"
    if (Test-Path $backupPath) {
        Copy-Item $backupPath $f -Force
        Write-Host "Restored $f from $backupPath" -ForegroundColor Green
    } elseif (Test-Path $f) {
        $content = Get-Content $f -Raw
        $content = $content.Replace($hetznerUrl, $cloudUrl).Replace($hetznerKey, $cloudKey)
        Set-Content -Path $f -Value $content -NoNewline
        Write-Host "Replaced URLs in $f -> Pointing back to Cloud" -ForegroundColor Green
    }
}

Write-Host "`nFALLBACK COMPLETE: All files are back on Supabase Cloud." -ForegroundColor Green
