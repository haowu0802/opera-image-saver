# Image Saver - Opera Extension

Hover any image on a webpage, click the save icon that appears in the top-right corner, and the original image is saved directly to a folder on your computer.

## How It Works

Browser extensions cannot write to arbitrary local paths for security reasons. This project uses **Native Messaging** - a standard Chromium mechanism where the extension communicates with a small Python helper process running on your machine. The helper process handles the actual file writing.

```
[Webpage Image] → [Content Script] → [Background Worker] → [Python Native Host] → [Local File]
   (hover/click)     (detect img)      (fetch image data)    (write to disk)
```

## Project Structure

```
opera-image-saver/
├── extension/                 # The browser extension
│   ├── manifest.json          # Extension manifest (MV3)
│   ├── popup/                 # Configuration popup UI
│   │   ├── popup.html
│   │   ├── popup.css
│   │   └── popup.js
│   ├── content/               # Content script (runs on every page)
│   │   ├── content.js         # Hover detection + save button
│   │   └── content.css        # Overlay + toast styling
│   ├── background/            # Service worker
│   │   └── background.js      # Fetches image, calls native host
│   └── icons/                 # Extension icons (16/48/128px)
├── native-host/               # Python native messaging host
│   ├── image_saver_host.py    # The host script (saves files to disk)
│   ├── run_host.bat           # Wrapper to launch the Python script
│   ├── com.hexwell.image_saver.json  # Native host manifest
│   └── install_host.ps1       # One-command installer (registry setup)
└── README.md
```

## Prerequisites

- **Opera** (or Chrome/Edge/Brave - any Chromium browser)
- **Python 3** installed and available in your PATH (`python --version`)

## Installation

### Step 1: Load the Extension

1. Open Opera and go to `opera://extensions`
2. Enable **Developer mode** (toggle in the top-right)
3. Click **Load unpacked**
4. Select the `extension/` folder
5. Note the **Extension ID** displayed under the extension card (a 32-character string like `abcdefghijklmnopabcdefghijklmnop`)

### Step 2: Install the Native Host

Open PowerShell and run:

```powershell
cd c:\_code\opera-image-saver\native-host
.\install_host.ps1 -ExtensionId "YOUR_EXTENSION_ID_HERE"
```

Replace `YOUR_EXTENSION_ID_HERE` with the ID from Step 1.

This script will:
- Update the native host manifest with the correct paths and your extension ID
- Register the host in the Windows registry for Opera, Chrome, and Chromium
- Verify that Python is available

### Step 3: Configure and Test

1. Click the Image Saver extension icon in Opera's toolbar
2. Enter your desired save folder path (e.g., `C:\Users\haowu\Pictures\saved_images`)
3. Click **Save**
4. Click **Test Connection** to verify the native host is working
5. You should see "Connected!" with the resolved path

### Step 4: Save Images

1. Navigate to any webpage with images
2. Hover your mouse over any image (larger than 48x48 pixels)
3. A download icon appears in the top-right corner of the image
4. Click it - the image is fetched and saved to your configured folder
5. A toast notification appears at the bottom-right confirming the save

## Features

- **Smart source detection**: Uses `currentSrc`, `src`, and lazy-load attributes (`data-src`, `data-original`, etc.)
- **All image formats**: JPG, PNG, GIF, WebP, BMP, SVG, AVIF, ICO
- **Data URL support**: Handles `data:image/...` embedded images
- **CORS bypass**: The background service worker fetches images with extension permissions, avoiding CORS restrictions
- **Filename collision handling**: If a file already exists, a timestamp is appended (e.g., `photo_20260804_103022.jpg`)
- **Toast notifications**: Non-intrusive feedback at the bottom-right of the page
- **Visual feedback**: The save icon shows a spinner during save, a checkmark on success, or an X on failure
- **Scroll-aware**: The overlay repositions or hides when scrolling
- **Minimum size filter**: Ignores tiny images (icons, tracking pixels) below 48x48 pixels

## Troubleshooting

### "Connection failed" when clicking Test Connection

1. Make sure Python is in your PATH: run `python --version` in a terminal
2. Make sure you ran `install_host.ps1` with the correct extension ID
3. Check the registry: run `regedit` and navigate to `HKCU\SOFTWARE\Google\Chrome\NativeMessagingHosts\com.hexwell.image_saver` - the default value should point to the `com.hexwell.image_saver.json` file
4. Reload the extension in `opera://extensions` after installing the native host
5. Restart Opera

### Image save fails with "Fetch failed"

Some websites block cross-origin requests even for extensions. This is rare but can happen with heavily protected sites. Try right-clicking the image and using "Save image as..." as a fallback.

### Image save fails with "Native host error"

Check that the `run_host.bat` file path in `com.hexwell.image_saver.json` is correct and points to an existing file. The `install_host.ps1` script sets this automatically.

## How Native Messaging Works

The extension and the Python host communicate using the Chrome Native Messaging protocol:
- Messages are JSON, UTF-8 encoded
- Each message is prefixed with a 4-byte little-endian length header
- Communication happens via stdin (host reads) and stdout (host writes)
- The host process is started fresh for each `sendNativeMessage()` call

The Python host sets stdin/stdout to binary mode on Windows to prevent line-ending corruption.

## Uninstallation

1. Remove the extension from `opera://extensions`
2. Remove the registry keys:
   ```powershell
   Remove-Item "HKCU:\SOFTWARE\Google\Chrome\NativeMessagingHosts\com.hexwell.image_saver" -Recurse
   Remove-Item "HKCU:\SOFTWARE\Opera Software\Opera Stable\NativeMessagingHosts\com.hexwell.image_saver" -Recurse -ErrorAction SilentlyContinue
   Remove-Item "HKCU:\SOFTWARE\Chromium\NativeMessagingHosts\com.hexwell.image_saver" -Recurse -ErrorAction SilentlyContinue
   ```
3. Delete the `opera-image-saver` folder
