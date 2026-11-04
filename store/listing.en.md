# Chrome Web Store listing (English)

Text to paste into the Developer Dashboard (English localization).

## Store listing

**Item name** (taken from `extName` in the manifest)
TabGattai - Save & merge tabs

**Summary** (`extDescription`, max 132 characters)
Save all tabs in one click and restore them later. Duplicate URLs move to your newest group. Data stays in your browser.

**Category**: Productivity

**Description**

```
TabGattai saves all your open tabs in one click and lets you restore them whenever you need.
Great for when too many tabs slow your browser down, or when you want to put a task aside for later.

■ Key feature: duplicate URLs move to the newest group
Saving the same page again never clutters your list.
When you save a URL that is already saved, TabGattai removes it from the older group and moves it to the newest group.
Older groups that become empty are deleted automatically, so your list stays tidy.

■ Features
• Click the toolbar icon to save and close every tab in the current window
• Saved tabs are listed in dated groups with title, favicon and URL
• Click a tab to open it in a new tab and remove it from the list (you can choose to keep it)
• Per group: Restore all, Rename, Copy URLs, Delete, Collapse
• Search across all saved tabs by title and URL as you type
• Export / import as JSON (duplicates are merged on import as well)
• Light, dark or system theme
• Japanese and English

■ What gets saved
• Tabs with normal web pages (http / https / file)
• Internal browser pages such as chrome:// are skipped
• Pinned tabs are skipped by default (configurable)

■ Privacy
• Saved URLs, titles and settings are stored only inside your browser (chrome.storage.local)
• No servers, no analytics, no ads
• No account required

■ Tip
• To open the list without saving, right-click the toolbar icon and choose "Options"
```

## Privacy practices

**Single purpose**
```
A tab manager that saves and restores open tabs, merging duplicate URLs into the newest saved group.
```

**Permission justification**

| Permission | Justification |
| --- | --- |
| tabs | Used to read the URL and title of the tabs in the current window in order to save them, close the saved tabs, and open them again when restoring. |
| storage | Used to store the saved tab list and settings locally in the user's browser (chrome.storage.local). |
| favicon | Used to show site icons in the saved list from Chrome's on-device favicon cache. No network requests are made. |

**Remote code**: No, all code is included in the package.

**Data usage**
- The extension handles the URLs of saved tabs, but all data is stored on the device and never transmitted.
- Whether to tick "Web history" depends on the dashboard's definitions; ticking it is the safe choice if unsure.
- Certify all three statements (no selling/transferring data, no unrelated use, no creditworthiness use).

**Privacy policy URL**
```
https://github.com/nagoring/TabGattai/blob/main/docs/privacy-policy.en.md
```

## Images (`store/assets/en/`)

Same file names and sizes as the Japanese set. Store icon: `public/icons/icon-128.png`.
