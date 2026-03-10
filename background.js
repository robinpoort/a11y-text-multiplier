// A11y Text Multiplier — background.js
// Updates the toolbar icon based on the autoApply setting and active multiplier

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

function updateIcon(active, multiplier) {
  chrome.action.setIcon({ imageData: { 64: drawIcon(active, multiplier) } });
}

// Set icon on startup
chrome.storage.local.get(['autoApply', 'currentMultiplier'], ({ autoApply, currentMultiplier }) => {
  updateIcon(!!autoApply, currentMultiplier ?? null);
});

// Update icon whenever the setting or multiplier changes
chrome.storage.onChanged.addListener((changes) => {
  if ('autoApply' in changes || 'currentMultiplier' in changes) {
    chrome.storage.local.get(['autoApply', 'currentMultiplier'], ({ autoApply, currentMultiplier }) => {
      updateIcon(!!autoApply, currentMultiplier ?? null);
    });
  }
});
