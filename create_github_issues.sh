#!/bin/bash
# Script to create GitHub issues for atlantisboard using GitHub CLI
# Usage: ./create_github_issues.sh

REPO="walster001/atlantisboard"

echo "Creating issues in $REPO using GitHub CLI..."
echo ""

# Issue 1
gh issue create --repo "$REPO" \
  --title "Custom themes need verification against new toastui editor and card components" \
  --body "Custom themes need to be checked and verified against new toastui editor, card components, etc." \
  --label "bug,enhancement"

# Issue 2
gh issue create --repo "$REPO" \
  --title "Fix attachment thumbnail/preview and hover formatting" \
  --body "Fix attachment thumbnail/preview when clicked from cards, fix hover formatting for delete and download buttons for attachments. Check whether files are stored efficiently and securely." \
  --label "bug"

# Issue 3
gh issue create --repo "$REPO" \
  --title "Test/verify all subtask/checklist functionality after permissions refactor" \
  --body "Test/verify all subtask/checklist functionality especially after permissions refactor." \
  --label "bug,testing"

# Issue 4
gh issue create --repo "$REPO" \
  --title "Security: Fix admin/manager demotion while board settings dialogs are open" \
  --body "Known Bug: If admin/manager user has board settings cog dialogs open, and another member demotes them, they need to refresh to lose their permissions/view. This is a security issue and should be fixed." \
  --label "bug,security"

# Issue 5
gh issue create --repo "$REPO" \
  --title "Invite links don't propagate to realtime board members list" \
  --body "Known Bug: Invite links don't propagate changes to realtime board members list. Likewise if dialogs open, board does not refresh underneath dialogs, or if in freeze state does not update after unfreezing." \
  --label "bug"

# Issue 6
gh issue create --repo "$REPO" \
  --title "Fix file upload internal server error - reconfigure from Supabase to Minio" \
  --body "Fix file upload internal server error, file imports still using supabase. Need to be reconfigured to point to Minio." \
  --label "bug"

# Issue 7
gh issue create --repo "$REPO" \
  --title "Fix file upload for change icon button in inline button importer" \
  --body "Fix file upload for 'change icon' button in inline button importer. Change icon should delete the existing file and replace it with new one, rather than keeping on adding files." \
  --label "bug"

# Issue 8
gh issue create --repo "$REPO" \
  --title "Labels don't create/implement properly and should update in realtime" \
  --body "Labels don't create/implement properly. Labels should update in realtime." \
  --label "bug"

# Issue 9
gh issue create --repo "$REPO" \
  --title "Check Trello imports for functionality" \
  --body "Check trello imports for functionality." \
  --label "bug,testing"

# Issue 10
gh issue create --repo "$REPO" \
  --title "Check Wekan imports for functionality" \
  --body "Check wekan imports for functionality." \
  --label "bug,testing"

echo ""
echo "Done!"


