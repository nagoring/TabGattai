# TabMerge Privacy Policy

Last updated: November 2, 2026

TabMerge ("the extension") is a tab management extension for Google Chrome. This policy explains what information the extension handles and how.

## 1. Information handled

When you click the toolbar icon to save tabs, the extension handles the following:

| Information | Purpose |
| --- | --- |
| URLs of the saved tabs | Showing the saved list, restoring tabs, merging duplicate URLs |
| Page titles of the saved tabs | Showing the saved list, search |
| Save time / group creation time | Showing and ordering groups, deciding which group is newest when merging duplicates |
| Group names you enter | Showing groups |
| Settings (pinned tabs, remove on restore, theme, language) | Configuring the extension |

The extension does not read page contents, form input, cookies, browsing history, passwords, or personally identifying information. It does not inject any scripts into web pages (no content scripts).

## 2. Where data is stored

All of the above is stored only in your browser's local storage area (`chrome.storage.local`). Chrome sync storage (`chrome.storage.sync`) is not used.

## 3. No transmission

The extension does not send any data, including the information above, to the developer or any third party.

- No external servers or databases
- No analytics
- No advertising
- No account or sign-in
- No remotely hosted code

Favicons (site icons) are displayed from Chrome's on-device cache through Chrome's `favicon` feature; the extension itself makes no network requests.

When you choose to restore a saved tab, the browser opens that page as usual, which naturally communicates with that website. This is ordinary browsing and does not involve the extension sending any data.

## 4. Export / import

When you use "Export to JSON", a JSON file containing your saved data (URLs, titles, group names, timestamps, IDs) is downloaded to your device. You are responsible for that file. Imported files are validated and stored only in your browser.

## 5. Permissions

| Permission | Reason |
| --- | --- |
| `tabs` | Read the URL and title of tabs in the current window to save them, close them after saving, and open them when restoring |
| `storage` | Store saved data and settings in your browser |
| `favicon` | Show site icons in the saved list from Chrome's on-device cache |

No host permissions are requested.

## 6. Deleting data

- Delete individual items with the "×" button or a whole group with "Delete group".
- Uninstalling the extension makes Chrome delete all data stored by it.

## 7. Sharing with third parties

Because the extension does not collect or transmit information, it never shares or sells it to third parties.

## 8. Changes

If this policy changes, this page will be updated together with the "Last updated" date. Significant changes regarding the information handled or data transmission will be announced in the extension's release notes.

## 9. Contact

Please use the Issues page of the GitHub repository:
https://github.com/nagoring/tabmerge/issues
