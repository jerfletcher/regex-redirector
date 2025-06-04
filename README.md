
# Regex Redirector Chrome Extension

Chrome extension for URL redirection using configurable regex rules. Supports multiple redirect endpoints per rule, a popup for configuration, and a banner on pages with active redirects.

## Project Structure

```
package.json
README.md
webpack.config.js
public/
  manifest.json
  popup.html
  icons/
    socks_16.ico
    socks_180.png
    socks_32.ico
    socks_48.ico
src/
  background.js         # Handles background logic and redirect processing
  content.js            # Injects banner and manages page-level UI
  messagingHelper.js    # Messaging between extension components
  popup.js              # Popup UI logic for rule config and endpoint dropdown
  storageHelper.js      # Reads/saves config file with redirect rules
```

## Features

- Reads and saves a config file with redirect rules
- Dropdown to select different redirect endpoints per rule
- Banner displayed when a page has a redirect present
- Popup for configuration and rule management


## Usage

1. Run `npm run build` to generate the extension in the `dist` folder.
2. In Chrome, go to Extensions > Load unpacked, and select the `dist` folder.
3. Open the popup to configure regex redirect rules and endpoints.
4. Select the desired endpoint for each rule from the dropdown.
5. When a redirect is triggered, a banner appears on the page.

## Permissions
- `webRequest`, `webRequestBlocking`, `storage`, `tabs`, `<all_urls>`

## Manifest V3
This extension uses the latest Chrome Manifest V3 standard.
