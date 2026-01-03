# Script to create GitHub issues for atlantisboard
# Requires GitHub Personal Access Token with 'repo' scope
# Usage: $env:GITHUB_TOKEN="your_token_here"; .\create_github_issues.ps1

$repo = "walster001/atlantisboard"
$baseUrl = "https://api.github.com/repos/$repo/issues"

# Check for GitHub token
if (-not $env:GITHUB_TOKEN) {
    Write-Host "Error: GITHUB_TOKEN environment variable is not set." -ForegroundColor Red
    Write-Host "Please set it with: `$env:GITHUB_TOKEN='your_token_here'" -ForegroundColor Yellow
    exit 1
}

$headers = @{
    "Authorization" = "token $env:GITHUB_TOKEN"
    "Accept" = "application/vnd.github.v3+json"
    "Content-Type" = "application/json"
}

$issues = @(
    @{
        title = "Custom themes need verification against new toastui editor and card components"
        body = "Custom themes need to be checked and verified against new toastui editor, card components, etc."
        labels = @("bug", "enhancement")
    },
    @{
        title = "Fix attachment thumbnail/preview and hover formatting"
        body = "Fix attachment thumbnail/preview when clicked from cards, fix hover formatting for delete and download buttons for attachments. Check whether files are stored efficiently and securely."
        labels = @("bug")
    },
    @{
        title = "Test/verify all subtask/checklist functionality after permissions refactor"
        body = "Test/verify all subtask/checklist functionality especially after permissions refactor."
        labels = @("bug", "testing")
    },
    @{
        title = "Security: Fix admin/manager demotion while board settings dialogs are open"
        body = "Known Bug: If admin/manager user has board settings cog dialogs open, and another member demotes them, they need to refresh to lose their permissions/view. This is a security issue and should be fixed."
        labels = @("bug", "security")
    },
    @{
        title = "Invite links don't propagate to realtime board members list"
        body = "Known Bug: Invite links don't propagate changes to realtime board members list. Likewise if dialogs open, board does not refresh underneath dialogs, or if in freeze state does not update after unfreezing."
        labels = @("bug")
    },
    @{
        title = "Fix file upload internal server error - reconfigure from Supabase to Minio"
        body = "Fix file upload internal server error, file imports still using supabase. Need to be reconfigured to point to Minio."
        labels = @("bug")
    },
    @{
        title = "Fix file upload for change icon button in inline button importer"
        body = "Fix file upload for 'change icon' button in inline button importer. Change icon should delete the existing file and replace it with new one, rather than keeping on adding files."
        labels = @("bug")
    },
    @{
        title = "Labels don't create/implement properly and should update in realtime"
        body = "Labels don't create/implement properly. Labels should update in realtime."
        labels = @("bug")
    },
    @{
        title = "Check Trello imports for functionality"
        body = "Check trello imports for functionality."
        labels = @("bug", "testing")
    },
    @{
        title = "Check Wekan imports for functionality"
        body = "Check wekan imports for functionality."
        labels = @("bug", "testing")
    }
)

Write-Host "Creating $($issues.Count) issues in $repo..." -ForegroundColor Cyan

foreach ($issue in $issues) {
    $body = @{
        title = $issue.title
        body = $issue.body
        labels = $issue.labels
    } | ConvertTo-Json

    try {
        $response = Invoke-RestMethod -Uri $baseUrl -Method Post -Headers $headers -Body $body
        Write-Host "[OK] Created issue: $($issue.title)" -ForegroundColor Green
        Write-Host "  URL: $($response.html_url)" -ForegroundColor Gray
    } catch {
        Write-Host "[FAIL] Failed to create issue: $($issue.title)" -ForegroundColor Red
        Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
        if ($_.ErrorDetails.Message) {
            try {
                $errorDetails = $_.ErrorDetails.Message | ConvertFrom-Json
                Write-Host "  Details: $($errorDetails.message)" -ForegroundColor Red
            } catch {
                Write-Host "  Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
            }
        }
    }
    
    Start-Sleep -Milliseconds 500
}

Write-Host ""
Write-Host "Done!" -ForegroundColor Cyan
