# Privacy Policy - Auto Tab Groups - Tab Manager

Last updated: 2026-04-22

## Summary

Auto Tab Groups - Tab Manager is designed to work locally in your browser.

- No user account is required.
- No analytics service is integrated.
- No tab data is transmitted to external servers by this extension.

## Data We Process

The extension processes tab metadata locally to provide core features, including:

- tab title and URL
- tab group metadata
- custom auto-group website lists and rules
- tab activity timeline/history
- workspace preferences (theme, language, launch surface, refresh options)
- optional navigation/redirect history if Redirect trace is enabled and permission is granted by the user

## Where Data Is Stored

Data is stored in browser-provided local/sync storage (`chrome.storage.local` and `chrome.storage.sync`) on your device/profile.

## Permissions and Why They Are Needed

- `tabs`: required to list and manage tabs.
- `tabGroups`: required to read and manage tab groups.
- `sidePanel`: required to open the side panel workspace.
- `storage`: required to persist settings and local history.
- `system.memory`: required to show memory snapshot information.
- `favicon`: required to display tab favicons.
- Optional `webNavigation`: used only when the user enables Redirect trace.
- Optional `webRequest` and optional host access for `http://*/*` and `https://*/*`: used only after the user enables Redirect trace and grants permission, so the extension can record main-frame redirect chains locally.

## Data Sharing

Auto Tab Groups - Tab Manager does not sell, transfer, or share your browsing data with third parties.

## Contact

If you publish this extension publicly, replace this section with your support email or website.
