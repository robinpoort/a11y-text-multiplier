// popup.js

let selectedMultiplier = 1.5;

const exampleWord = 'hello world';

function multiplyPreview(text, multiplier) {
  const trimmed = text.trim();
  const hasSpaces = /\s/.test(trimmed);
  const separator = hasSpaces ? ' ' : '';

  let added;
  if (Number.isInteger(multiplier)) {
    added = (separator + trimmed).repeat(multiplier - 1);
  } else {
    added = separator + trimmed.substring(0, Math.ceil(trimmed.length * (multiplier - 1)));
  }
  return { original: trimmed, added };
}

function updatePreview() {
  const preview = document.getElementById('preview');
  const { original, added } = multiplyPreview(exampleWord, selectedMultiplier);
  preview.innerHTML = `<span class="original">${original}</span><span class="added">${added}</span>`;
}

function showStatus(msg, isReset = false) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = 'status show' + (isReset ? ' reset' : '');
  setTimeout(() => { el.className = 'status'; }, 2000);
}

function isInjectableUrl(url) {
  return url && !url.startsWith('chrome://') && !url.startsWith('chrome-extension://') && !url.startsWith('about:') && !url.startsWith('edge://');
}

async function injectContentScript(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content.js']
  });
}

// Multiplier button selection
document.querySelectorAll('.mult-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mult-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedMultiplier = parseFloat(btn.dataset.value);
    updatePreview();
  });
});

// Apply
document.getElementById('applyBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!isInjectableUrl(tab.url)) { showStatus('⚠ Cannot run on this page'); return; }
  await injectContentScript(tab.id);

  const autoApply = document.getElementById('autoApply').checked;

  chrome.tabs.sendMessage(tab.id, { action: 'apply', multiplier: selectedMultiplier }, (res) => {
    if (chrome.runtime.lastError) {
      showStatus('⚠ Could not inject');
      return;
    }
    showStatus(`✓ ${selectedMultiplier}× applied`);
  });

  if (autoApply) {
    chrome.tabs.sendMessage(tab.id, { action: 'save', multiplier: selectedMultiplier }, () => {
      chrome.runtime.sendMessage({ action: 'updateIcon', tabId: tab.id });
    });
  }
});

// Reset
document.getElementById('resetBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!isInjectableUrl(tab.url)) { showStatus('⚠ Cannot run on this page', true); return; }
  await injectContentScript(tab.id);

  chrome.tabs.sendMessage(tab.id, { action: 'reset' }, (res) => {
    if (chrome.runtime.lastError) {
      showStatus('⚠ Nothing to reset', true);
      return;
    }
    showStatus('↺ Original restored', true);
    selectedMultiplier = 1.5;
    document.querySelectorAll('.mult-btn').forEach(btn => {
      btn.classList.toggle('active', parseFloat(btn.dataset.value) === 1.5);
    });
    updatePreview();
  });

  // Clear saved state so it doesn't re-apply on next refresh
  chrome.tabs.sendMessage(tab.id, { action: 'clearSave' }, () => {
    chrome.runtime.sendMessage({ action: 'updateIcon', tabId: tab.id });
  });

});

// Auto-apply checkbox — persist preference, clear saved state when disabled
const autoApplyCheckbox = document.getElementById('autoApply');

chrome.storage.local.get('autoApply', ({ autoApply }) => {
  autoApplyCheckbox.checked = !!autoApply;
});

autoApplyCheckbox.addEventListener('change', async (e) => {
  chrome.storage.local.set({ autoApply: e.target.checked });

  if (!e.target.checked) {
    // Remove saved state for this tab so it won't re-apply on refresh
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!isInjectableUrl(tab.url)) return;
    await injectContentScript(tab.id);
    chrome.tabs.sendMessage(tab.id, { action: 'clearSave' });
  }
});

// On popup open: restore active button state from tab's sessionStorage
(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!isInjectableUrl(tab.url)) return;
  await injectContentScript(tab.id);
  chrome.tabs.sendMessage(tab.id, { action: 'getState' }, (res) => {
    if (chrome.runtime.lastError || !res || !res.multiplier) return;
    selectedMultiplier = res.multiplier;
    document.querySelectorAll('.mult-btn').forEach(btn => {
      btn.classList.toggle('active', parseFloat(btn.dataset.value) === selectedMultiplier);
    });
    updatePreview();
  });
})();

updatePreview();
