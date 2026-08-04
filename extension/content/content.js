(function () {
  'use strict';

  const MIN_IMAGE_SIZE = 200; // px — ignore images smaller than 200x200
  const HIDE_DELAY = 250; // ms — grace period before hiding the button

  const SAVE_ICON_SVG = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
         stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>`;

  const CHECK_ICON_SVG = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
         stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>`;

  const ERROR_ICON_SVG = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
         stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>`;

  const SPINNER_SVG = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
         stroke="white" stroke-width="2.5" stroke-linecap="round">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>`;

  let overlay = null;
  let currentImg = null;
  let hideTimer = null;

  // ---- Overlay management ----

  function createOverlay() {
    overlay = document.createElement('div');
    overlay.className = 'img-saver-overlay';
    overlay.innerHTML = SAVE_ICON_SVG;
    overlay.addEventListener('mouseenter', cancelHide);
    overlay.addEventListener('mouseleave', scheduleHide);
    overlay.addEventListener('click', handleSaveClick);
    document.documentElement.appendChild(overlay);
  }

  function showOverlay(img) {
    if (!overlay) createOverlay();

    const rect = img.getBoundingClientRect();

    // Skip tiny images
    if (rect.width < MIN_IMAGE_SIZE || rect.height < MIN_IMAGE_SIZE) {
      hideOverlay();
      return;
    }

    currentImg = img;
    overlay.style.display = 'flex';
    overlay.className = 'img-saver-overlay';
    overlay.innerHTML = SAVE_ICON_SVG;
    positionOverlay(rect);
  }

  function positionOverlay(rect) {
    const top = rect.top + window.scrollY + 6;
    let left = rect.right + window.scrollX - 38;
    // Keep overlay within viewport horizontally
    const maxLeft = window.scrollX + window.innerWidth - 40;
    if (left > maxLeft) left = maxLeft;
    if (left < window.scrollX + 4) left = window.scrollX + 4;
    overlay.style.top = `${top}px`;
    overlay.style.left = `${left}px`;
  }

  function hideOverlay() {
    if (overlay) {
      overlay.style.display = 'none';
    }
    currentImg = null;
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hideOverlay, HIDE_DELAY);
  }

  function cancelHide() {
    clearTimeout(hideTimer);
  }

  // ---- Image source extraction ----

  function getImageSource(img) {
    // Priority: currentSrc (responsive images) > src > data-src > data-original
    if (img.currentSrc) return img.currentSrc;
    if (img.src) return img.src;

    const lazyAttrs = ['data-src', 'data-original', 'data-lazy-src', 'data-actualsrc'];
    for (const attr of lazyAttrs) {
      const val = img.getAttribute(attr);
      if (val) return val;
    }
    return null;
  }

  // ---- Save flow ----

  function setOverlayState(state) {
    overlay.className = `img-saver-overlay ${state}`;
    switch (state) {
      case 'saving':
        overlay.innerHTML = SPINNER_SVG;
        overlay.querySelector('svg').style.animation = 'img-saver-spin 0.8s linear infinite';
        addSpinKeyframe();
        break;
      case 'saved':
        overlay.innerHTML = CHECK_ICON_SVG;
        break;
      case 'error':
        overlay.innerHTML = ERROR_ICON_SVG;
        break;
    }
  }

  let spinKeyframeAdded = false;
  function addSpinKeyframe() {
    if (spinKeyframeAdded) return;
    const style = document.createElement('style');
    style.textContent = '@keyframes img-saver-spin { to { transform: rotate(360deg); } }';
    document.head.appendChild(style);
    spinKeyframeAdded = true;
  }

  // Track the current save task so we can match SAVE_RESULT messages
  let currentSaveId = null;
  let saveTimeoutTimer = null;
  const SAVE_TIMEOUT_MS = 60000; // reset spinner after 60s even if no response

  function handleSaveClick(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!currentImg) return;

    const imgUrl = getImageSource(currentImg);
    if (!imgUrl) {
      showToast('Could not determine image source', 'error');
      return;
    }

    setOverlayState('saving');
    const filenameHint = extractFilename(imgUrl, currentImg);

    // Fire and forget — background responds immediately with {started: true}
    // The actual result comes back via SAVE_RESULT message (best-effort).
    chrome.runtime.sendMessage(
      { type: 'SAVE_IMAGE', url: imgUrl, filename: filenameHint },
      (response) => {
        if (chrome.runtime.lastError || !response || !response.started) {
          setOverlayState('error');
          showToast('Failed to start download', 'error');
          resetOverlayAfterDelay();
        }
        // If started successfully, keep spinner — result comes via SAVE_RESULT
      }
    );

    // Safety timeout: if no result after 60s, reset the spinner.
    // The save may still complete in the background — check History.
    clearTimeout(saveTimeoutTimer);
    saveTimeoutTimer = setTimeout(() => {
      if (overlay && overlay.classList.contains('saving')) {
        overlay.className = 'img-saver-overlay';
        overlay.innerHTML = SAVE_ICON_SVG;
        showToast('Save still processing — check History', 'info');
      }
    }, SAVE_TIMEOUT_MS);
  }

  // Listen for save results from background (best-effort — only works if tab still alive)
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SAVE_RESULT') {
      clearTimeout(saveTimeoutTimer);

      if (message.success) {
        setOverlayState('saved');
        showToast(`Saved: ${message.filename}`, 'success');
      } else {
        setOverlayState('error');
        showToast(`Failed: ${message.error}`, 'error');
      }
      resetOverlayAfterDelay();
    }
  });

  function resetOverlayAfterDelay() {
    setTimeout(() => {
      if (overlay && currentImg) {
        overlay.className = 'img-saver-overlay';
        overlay.innerHTML = SAVE_ICON_SVG;
      }
    }, 1500);
  }

  function extractFilename(url, img) {
    try {
      const u = new URL(url, window.location.href);
      const pathname = u.pathname;
      const basename = pathname.split('/').pop();
      if (basename && basename.includes('.')) {
        // Strip query params, take the part before '?'
        return basename.split('?')[0];
      }
    } catch (e) {
      // data: URL or invalid
    }

    // Fallback: use alt text or page title
    if (img.alt) {
      return img.alt.replace(/[^\w\u4e00-\u9fff.-]/g, '_').substring(0, 40) + '.jpg';
    }
    return `image_${Date.now()}.jpg`;
  }

  // ---- Toast notification ----

  let toastEl = null;
  let toastTimer = null;

  function showToast(message, type) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'img-saver-toast';
      document.body.appendChild(toastEl);
    }

    toastEl.textContent = message;
    toastEl.className = `img-saver-toast ${type}`;

    // Force reflow then show
    void toastEl.offsetWidth;
    toastEl.classList.add('show');

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove('show');
    }, 3000);
  }

  // ---- Event listeners (delegation) ----

  document.addEventListener('mouseover', (e) => {
    const img = e.target.closest('img');
    if (img && img !== currentImg) {
      cancelHide();
      showOverlay(img);
    } else if (img && img === currentImg) {
      cancelHide();
    }
  });

  document.addEventListener('mouseout', (e) => {
    const img = e.target.closest('img');
    if (img && img === currentImg) {
      // Check if we moved to the overlay
      const related = e.relatedTarget;
      if (related !== overlay) {
        scheduleHide();
      }
    }
  });

  // Reposition on scroll / resize
  let scrollTimer = null;
  window.addEventListener('scroll', () => {
    if (!currentImg) return;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      const rect = currentImg.getBoundingClientRect();
      // Hide if image scrolled out of view
      if (
        rect.bottom < 0 ||
        rect.top > window.innerHeight ||
        rect.right < 0 ||
        rect.left > window.innerWidth
      ) {
        hideOverlay();
      } else {
        positionOverlay(rect);
      }
    }, 16);
  }, { passive: true });

  window.addEventListener('resize', () => {
    if (currentImg) {
      const rect = currentImg.getBoundingClientRect();
      positionOverlay(rect);
    }
  });
})();
