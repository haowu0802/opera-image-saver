// ---- Elements ----
const tabSettings = document.getElementById('tabSettings');
const tabHistory = document.getElementById('tabHistory');
const settingsPanel = document.getElementById('settingsPanel');
const historyPanel = document.getElementById('historyPanel');

const savePathInput = document.getElementById('savePath');
const saveBtn = document.getElementById('saveBtn');
const testBtn = document.getElementById('testBtn');
const statusEl = document.getElementById('status');

const historyList = document.getElementById('historyList');
const historyCount = document.getElementById('historyCount');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');

const NATIVE_HOST_NAME = 'com.hexwell.image_saver';

// ---- Tab switching ----
tabSettings.addEventListener('click', () => switchTab('settings'));
tabHistory.addEventListener('click', () => switchTab('history'));

function switchTab(tab) {
  if (tab === 'settings') {
    tabSettings.classList.add('active');
    tabHistory.classList.remove('active');
    settingsPanel.style.display = '';
    historyPanel.style.display = 'none';
  } else {
    tabHistory.classList.add('active');
    tabSettings.classList.remove('active');
    historyPanel.style.display = '';
    settingsPanel.style.display = 'none';
    loadHistory();
  }
}

// ---- Settings ----

chrome.storage.local.get(['savePath'], (result) => {
  if (result.savePath) {
    savePathInput.value = result.savePath;
  }
});

function showStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = `status show ${type}`;
}

saveBtn.addEventListener('click', () => {
  const path = savePathInput.value.trim();
  if (!path) {
    showStatus('Please enter a save folder path.', 'error');
    return;
  }
  chrome.storage.local.set({ savePath: path }, () => {
    showStatus('Path saved.', 'success');
  });
});

testBtn.addEventListener('click', () => {
  const path = savePathInput.value.trim();
  if (!path) {
    showStatus('Please enter and save a path first.', 'error');
    return;
  }
  showStatus('Testing connection...', 'info');
  chrome.runtime.sendNativeMessage(
    NATIVE_HOST_NAME,
    { type: 'ping', savePath: path },
    (response) => {
      if (chrome.runtime.lastError) {
        showStatus(
          `Connection failed: ${chrome.runtime.lastError.message}`,
          'error'
        );
      } else if (response && response.success) {
        showStatus(`Connected! Save folder: ${response.savePath}`, 'success');
      } else {
        showStatus(`Host error: ${response ? response.error : 'Unknown error'}`, 'error');
      }
    }
  );
});

// ---- History ----

const ICON_SUCCESS = `<svg viewBox="0 0 24 24" fill="none" stroke="#43a047" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const ICON_FAILED = `<svg viewBox="0 0 24 24" fill="none" stroke="#e53935" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
const ICON_PENDING = `<svg viewBox="0 0 24 24" fill="none" stroke="#fb8c00" stroke-width="2.5" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;

let historyPollTimer = null;

function loadHistory() {
  chrome.runtime.sendMessage({ type: 'GET_HISTORY' }, (response) => {
    if (chrome.runtime.lastError || !response) return;
    renderHistory(response.history || []);
  });

  // If there are pending items, poll for updates
  if (historyPollTimer) clearTimeout(historyPollTimer);
  historyPollTimer = setTimeout(() => {
    if (historyPanel.style.display !== 'none') {
      loadHistory();
    }
  }, 2000);
}

function renderHistory(history) {
  if (!history || history.length === 0) {
    historyList.innerHTML = '<div class="history-empty">No downloads yet.</div>';
    historyCount.textContent = '';
    return;
  }

  const hasPending = history.some((e) => e.status === 'pending');
  historyCount.textContent = `${history.length} item${history.length > 1 ? 's' : ''}`;

  historyList.innerHTML = history.map((entry) => {
    let icon = '';
    let statusClass = '';
    let retryBtn = '';

    if (entry.status === 'success') {
      icon = ICON_SUCCESS;
      statusClass = 'status-success';
    } else if (entry.status === 'failed') {
      icon = ICON_FAILED;
      statusClass = 'status-failed';
      retryBtn = `<button class="retry-btn" data-id="${entry.id}">Retry</button>`;
    } else {
      icon = ICON_PENDING;
      statusClass = 'status-pending';
    }

    const time = formatTime(entry.timestamp);
    const sizeText = entry.savedSize ? ` · ${formatSize(entry.savedSize)}` : '';
    const errorText = entry.error ? `<div class="history-error">${escapeHtml(entry.error)}</div>` : '';

    return `
      <div class="history-item ${statusClass}">
        <div class="history-icon">${icon}</div>
        <div class="history-body">
          <div class="history-filename">${escapeHtml(entry.filename || 'unknown')}</div>
          <div class="history-meta">${time}${sizeText}</div>
          ${errorText}
        </div>
        <div class="history-actions">${retryBtn}</div>
      </div>
    `;
  }).join('');

  // Attach retry listeners
  historyList.querySelectorAll('.retry-btn').forEach((btn) => {
    btn.addEventListener('click', () => handleRetry(btn.dataset.id, btn));
  });

  // Keep polling if there are pending items
  if (hasPending && historyPanel.style.display !== 'none') {
    if (historyPollTimer) clearTimeout(historyPollTimer);
    historyPollTimer = setTimeout(loadHistory, 2000);
  }
}

function handleRetry(id, btn) {
  btn.disabled = true;
  btn.textContent = '...';
  chrome.runtime.sendMessage({ type: 'RETRY_DOWNLOAD', id }, (response) => {
    if (chrome.runtime.lastError || !response) {
      btn.disabled = false;
      btn.textContent = 'Retry';
      return;
    }
    // Refresh history after a short delay to show updated status
    setTimeout(loadHistory, 500);
  });
}

clearHistoryBtn.addEventListener('click', () => {
  if (!confirm('Clear all download history?')) return;
  chrome.runtime.sendMessage({ type: 'CLEAR_HISTORY' }, () => {
    loadHistory();
  });
});

// ---- Helpers ----

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
