// A11y Text Multiplier — content.js
// Stores original text nodes so they can be reset

(() => {
  if (window.a11yTextMultiplierLoaded) return;
  window.a11yTextMultiplierLoaded = true;

  const ATTR = 'data-a11y-original';
  const SESSION_KEY = 'a11y-multiplier';

  function getDirectTextNodes(root) {
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const text = node.nodeValue;
          // Must have non-whitespace content
          if (!text || !text.trim()) return NodeFilter.FILTER_REJECT;
          // Skip script/style/noscript tags
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          const tag = parent.tagName.toLowerCase();
          if (['script', 'style', 'noscript', 'textarea', 'input'].includes(tag)) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const nodes = [];
    let node;
    while ((node = walker.nextNode())) {
      nodes.push(node);
    }
    return nodes;
  }

  function multiplyText(text, multiplier) {
    const trimmed = text.trim();
    if (!trimmed) return text;

    // Preserve leading/trailing whitespace
    const leading = text.match(/^(\s*)/)[1];
    const trailing = text.match(/(\s*)$/)[1];

    const hasSpaces = /\s/.test(trimmed);
    const separator = hasSpaces ? ' ' : '';

    let result;
    if (Number.isInteger(multiplier)) {
      result = (trimmed + separator).repeat(multiplier - 1) + trimmed;
    } else {
      const extra = trimmed.substring(0, Math.ceil(trimmed.length * (multiplier - 1)));
      result = trimmed + separator + extra;
    }

    return leading + result + trailing;
  }

  function applyMultiplier(multiplier) {
    const nodes = getDirectTextNodes(document.body);

    for (const node of nodes) {
      const parent = node.parentElement;
      if (!parent) continue;

      // Save original if not already saved
      if (!parent.hasAttribute(ATTR)) {
        parent.setAttribute(ATTR, node.nodeValue);
      }

      // Always start from original
      const original = parent.getAttribute(ATTR);
      node.nodeValue = multiplyText(original, multiplier);
    }
  }

  function resetText() {
    // Find all elements that have the original attribute
    const elements = document.querySelectorAll(`[${ATTR}]`);
    for (const el of elements) {
      const original = el.getAttribute(ATTR);
      // Find the text node child and restore it
      for (const child of el.childNodes) {
        if (child.nodeType === Node.TEXT_NODE && child.nodeValue.trim()) {
          child.nodeValue = original;
          break;
        }
      }
      el.removeAttribute(ATTR);
    }
  }

  // Auto-apply saved multiplier on page load / refresh
  const saved = sessionStorage.getItem(SESSION_KEY);
  if (saved) {
    applyMultiplier(parseFloat(saved));
  }

  // Listen for messages from the popup
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'apply') {
      applyMultiplier(msg.multiplier);
      sendResponse({ ok: true });
    } else if (msg.action === 'reset') {
      resetText();
      sendResponse({ ok: true });
    } else if (msg.action === 'save') {
      sessionStorage.setItem(SESSION_KEY, msg.multiplier);
      sendResponse({ ok: true });
    } else if (msg.action === 'clearSave') {
      sessionStorage.removeItem(SESSION_KEY);
      sendResponse({ ok: true });
    } else if (msg.action === 'getState') {
      const value = sessionStorage.getItem(SESSION_KEY);
      sendResponse({ multiplier: value ? parseFloat(value) : null });
    }
  });
})();
