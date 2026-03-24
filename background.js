// A11y Text Multiplier — background.js
// Updates the toolbar icon per tab based on whether a multiplier is active on that tab

function drawIcon(active, multiplier) {
  const size = 64;
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = active ? '#7effb2' : '#3a3a4a';
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, 12);
  ctx.fill();

  // Label: multiplier value when active, "A" otherwise
  const label = active && multiplier ? String(multiplier) : 'A';
  ctx.fillStyle = active ? '#0f0f11' : '#888899';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.font = 'bold 48px sans-serif';

  ctx.fillText(label, size / 2, size / 2 + 2);

  return ctx.getImageData(0, 0, size, size);
}

function isRestricted(url) {
  return !url ||
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('about:') ||
    url.startsWith('edge://');
}

function setIcon(tabId, active, multiplier) {
  const img = drawIcon(active, multiplier);
  if (tabId != null) {
    chrome.action.setIcon({ tabId, imageData: { 64: img } });
  } else {
    chrome.action.setIcon({ imageData: { 64: img } });
  }
}

async function updateIconForTab(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (isRestricted(tab.url)) {
      setIcon(tabId, false, null);
      return;
    }
    chrome.tabs.sendMessage(tabId, { action: 'getState' }, (res) => {
      if (chrome.runtime.lastError || !res?.multiplier) {
        setIcon(tabId, false, null);
      } else {
        setIcon(tabId, true, res.multiplier);
      }
    });
  } catch (e) {}
}

chrome.tabs.onActivated.addListener(({ tabId }) => {
  updateIconForTab(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete') {
    updateIconForTab(tabId);
  }
});

// Triggered by popup after apply/reset
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'updateIcon' && msg.tabId != null) {
    updateIconForTab(msg.tabId);
  }
});
