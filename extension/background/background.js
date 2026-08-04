const NATIVE_HOST_NAME = 'com.hexwell.image_saver';
const MAX_HISTORY = 200;

// ---- Message router ----
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'SAVE_IMAGE':
      // Respond immediately so content script doesn't block on page refresh
      handleSaveImageRequest(message, sender);
      sendResponse({ success: true, started: true });
      return false; // don't keep channel open — save runs independently

    case 'RETRY_DOWNLOAD':
      handleRetry(message.id)
        .then((result) => sendResponse(result));
      return true;

    case 'GET_HISTORY':
      getHistory().then((history) => sendResponse({ history }));
      return true;

    case 'CLEAR_HISTORY':
      clearHistory().then(() => sendResponse({ success: true }));
      return true;

    default:
      return false;
  }
});

// ============================================================
//  Save flow — runs entirely in background, independent of
//  whether the content script / tab still exists.
// ============================================================

function handleSaveImageRequest(message, sender) {
  const imageUrl = message.url;
  const filenameHint = message.filename;
  const tabId = sender.tab ? sender.tab.id : null;
  const pageUrl = sender.tab ? sender.tab.url : '';

  // Create history entry immediately
  const entry = {
    id: genId(),
    url: imageUrl,
    filename: filenameHint,
    pageUrl: pageUrl,
    timestamp: Date.now(),
    status: 'pending',
    error: '',
    savedPath: '',
    savedSize: 0,
  };

  addHistory(entry);

  // Kick off the actual save — not tied to the message channel
  doSave(imageUrl, filenameHint, entry.id)
    .then((result) => {
      // Best-effort notification to the tab
      if (tabId !== null) {
        chrome.tabs.sendMessage(tabId, {
          type: 'SAVE_RESULT',
          id: entry.id,
          success: result.success,
          filename: result.filename || '',
          error: result.error || '',
        }).catch(() => { /* tab gone — ignore */ });
      }
    })
    .catch(() => { /* already handled inside doSave */ });
}

async function handleRetry(historyId) {
  const history = await getHistory();
  const entry = history.find((e) => e.id === historyId);
  if (!entry) {
    return { success: false, error: 'History entry not found' };
  }
  if (entry.status === 'pending') {
    return { success: false, error: 'Download already in progress' };
  }

  // Reset to pending
  await updateHistoryEntry(historyId, {
    status: 'pending',
    error: '',
    savedPath: '',
    savedSize: 0,
    timestamp: Date.now(),
  });

  const result = await doSave(entry.url, entry.filename, historyId);
  return result;
}

async function doSave(imageUrl, filenameHint, historyId) {
  // Get the configured save path
  const { savePath } = await chrome.storage.local.get(['savePath']);
  if (!savePath) {
    const error = 'No save path configured. Open the extension popup to set one.';
    await updateHistoryEntry(historyId, { status: 'failed', error });
    return { success: false, error };
  }

  let base64Data = null;
  let mimeType = 'image/jpeg';

  if (imageUrl.startsWith('data:')) {
    const parsed = parseDataUrl(imageUrl);
    if (!parsed) {
      const error = 'Failed to parse data URL';
      await updateHistoryEntry(historyId, { status: 'failed', error });
      return { success: false, error };
    }
    base64Data = parsed.data;
    mimeType = parsed.mime || 'image/jpeg';
  } else {
    try {
      const response = await fetch(imageUrl, {
        credentials: 'include',
        redirect: 'follow',
      });
      if (!response.ok) {
        const error = `HTTP ${response.status} fetching image`;
        await updateHistoryEntry(historyId, { status: 'failed', error });
        return { success: false, error };
      }
      mimeType = response.headers.get('content-type') || 'image/jpeg';
      const arrayBuffer = await response.arrayBuffer();
      base64Data = arrayBufferToBase64(arrayBuffer);
    } catch (err) {
      const error = `Fetch failed: ${err.message}`;
      await updateHistoryEntry(historyId, { status: 'failed', error });
      return { success: false, error };
    }
  }

  const ext = getExtension(mimeType, filenameHint);
  const cleanFilename = sanitizeFilename(filenameHint, ext);

  // Send to native host
  return new Promise((resolve) => {
    chrome.runtime.sendNativeMessage(
      NATIVE_HOST_NAME,
      {
        type: 'save',
        imageData: base64Data,
        filename: cleanFilename,
        savePath: savePath,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          const error = `Native host error: ${chrome.runtime.lastError.message}`;
          updateHistoryEntry(historyId, { status: 'failed', error });
          resolve({ success: false, error });
        } else if (response && response.success) {
          updateHistoryEntry(historyId, {
            status: 'success',
            savedPath: response.path || '',
            savedSize: response.size || 0,
          });
          resolve({ success: true, filename: response.filename });
        } else {
          const error = response ? response.error : 'Unknown native host error';
          updateHistoryEntry(historyId, { status: 'failed', error });
          resolve({ success: false, error });
        }
      }
    );
  });
}

// ============================================================
//  History management (chrome.storage.local)
// ============================================================

async function getHistory() {
  const { saveHistory } = await chrome.storage.local.get(['saveHistory']);
  return saveHistory || [];
}

async function addHistory(entry) {
  const history = await getHistory();
  history.unshift(entry);
  // Trim to max
  if (history.length > MAX_HISTORY) {
    history.length = MAX_HISTORY;
  }
  await chrome.storage.local.set({ saveHistory: history });
}

async function updateHistoryEntry(id, updates) {
  const history = await getHistory();
  const idx = history.findIndex((e) => e.id === id);
  if (idx !== -1) {
    Object.assign(history[idx], updates);
    await chrome.storage.local.set({ saveHistory: history });
  }
}

async function clearHistory() {
  await chrome.storage.local.set({ saveHistory: [] });
}

function genId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ============================================================
//  Helpers
// ============================================================

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

function parseDataUrl(dataUrl) {
  const match = dataUrl.match(/^data:([^;]+)?(;base64)?,(.*)$/);
  if (!match) return null;
  const mime = match[1] || 'image/jpeg';
  const isBase64 = !!match[2];
  const data = isBase64 ? match[3] : btoa(unescape(encodeURIComponent(match[3])));
  return { mime, data };
}

function getExtension(mimeType, filenameHint) {
  if (filenameHint && filenameHint.includes('.')) {
    const ext = filenameHint.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif', 'ico'].includes(ext)) {
      return ext === 'jpeg' ? 'jpg' : ext;
    }
  }
  const mimeToExt = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif',
    'image/webp': 'webp', 'image/bmp': 'bmp', 'image/svg+xml': 'svg',
    'image/avif': 'avif', 'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico',
  };
  return mimeToExt[mimeType] || 'jpg';
}

function sanitizeFilename(filename, ext) {
  let base = filename || 'image';
  base = base.replace(/\.[^.]+$/, '');
  base = base.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
  if (!base) base = 'image';
  if (base.length > 80) base = base.substring(0, 80);
  return `${base}.${ext}`;
}
