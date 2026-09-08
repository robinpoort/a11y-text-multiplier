// Spill — content.js
// Multiplies the text on the page, and remembers every original so it can be put back
// exactly as it was — text nodes, the attributes the settings asked for, and the outline
// that marks what changed.
//
// A plain IIFE, not a module: a content script declared in the manifest cannot use
// `import`. That is why the multiply rule below is written out a second time in
// popup.js, for the preview.

(() => {
  if (window.__spillLoaded) return;
  window.__spillLoaded = true;

  const SESSION_KEY = 'spill:state';

  /** Text inside these is markup, or a value the reader typed. Never prose. */
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT']);

  /** `contenteditable="false"` matches `[contenteditable]`, and it is not editable. */
  const EDITABLE = '[contenteditable]:not([contenteditable="false"])';

  /** The same four the Settings panel offers, in the same order. */
  const ATTRIBUTES = ['placeholder', 'title', 'alt', 'aria-label'];

  /**
   * The original of every text node this script has touched.
   *
   * Keyed by the node itself, not by an attribute on its parent. An element can hold more
   * than one text node — `<p>Read <a>more</a> here</p>` gives the paragraph two — and one
   * attribute per element can only hold one of them. The second node then took the first
   * one's original as its own, so " here" was overwritten with "Read " and no reset could
   * bring it back. An inline link in a paragraph is about the most ordinary markup there
   * is, so this went wrong on nearly every page.
   *
   * Cleared on reset, and gone with the page on the next navigation. A node the page
   * removes in between is held until then; for a testing tool that is a fair price for
   * being able to walk the list on reset, which a WeakMap cannot do.
   */
  const originals = new Map();

  /** Element → { attribute: original }, for the same reason. */
  const attrOriginals = new Map();

  /** Element → its style attribute exactly as it stood before the outline went on. */
  const highlighted = new Map();

  /** What the page is showing right now, so the popup can open on it. */
  let applied = null;
  let appliedOptions = null;

  // sessionStorage throws rather than returns when a page has storage blocked, and taking
  // the content script down with it would break the page it is a guest on.
  const readSaved = () => { try { return sessionStorage.getItem(SESSION_KEY); } catch { return null; } };
  const writeSaved = (value) => { try { sessionStorage.setItem(SESSION_KEY, value); } catch { /* not kept */ } };
  const clearSaved = () => { try { sessionStorage.removeItem(SESSION_KEY); } catch { /* nothing to clear */ } };

  /* ------------------------------------------------------------------ scope */

  /** A selector the popup let through can still be nonsense by the time it gets here. */
  function safeSelector(selector) {
    if (!selector || !selector.trim()) return '';
    try {
      document.querySelector(selector);
      return selector;
    } catch {
      return '';
    }
  }

  /**
   * Off limits to every kind of rewriting: a contenteditable is a document the reader may
   * go on to save, and `extra` is whatever they told the Settings panel to leave alone.
   */
  const offLimits = (el, extra) => !!el.closest(EDITABLE) || (extra ? !!el.closest(extra) : false);

  /**
   * And on top of that, for text: the tags whose contents are not prose. This is only
   * about text, because an input's placeholder is neither markup nor something the reader
   * typed — it is exactly the kind of label worth stretching.
   */
  const skipText = (el, extra) => SKIP.has(el.tagName.toUpperCase()) || offLimits(el, extra);

  function textNodes(root, extra) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        // Uppercased first: an element inside an <svg> reports its tag in lower case.
        if (!parent || skipText(parent, extra)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const nodes = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node);
    return nodes;
  }

  /* -------------------------------------------------------------- highlight */

  // Magenta, because an outline drawn over someone else's page has to be unmistakably not
  // theirs on a light page and on a dark one. Settings can change it; this is what stands
  // in when nothing was passed, and it matches DEFAULT_COLOUR in settings.js, which a
  // content script cannot import.
  const DEFAULT_OUTLINE = '#ff00ff';
  const COLOUR = /^#[0-9a-f]{6}$/i;

  /**
   * Set on the element itself rather than through a stylesheet of our own.
   *
   * A rule in an injected <style> carries the specificity of the one class it is written
   * with, so any page rule that is both more specific and !important beats it — and
   * `outline: none !important` on something like `#main p` is a common enough focus reset
   * that the outline simply never appeared. An important declaration in the style
   * attribute is the top of the author cascade, so nothing on the page outranks it. It is
   * also out of reach of a page's style-src, which can block an injected <style> outright.
   */
  function highlight(el, colour) {
    if (!el || highlighted.has(el)) return;
    // The whole attribute as it stood, including there being none at all: an element that
    // had no style attribute must not be left holding an empty one.
    highlighted.set(el, el.getAttribute('style'));
    el.style.setProperty('outline', `2px dashed ${colour}`, 'important');
    el.style.setProperty('outline-offset', '1px', 'important');
  }

  /* ----------------------------------------------------------- apply, reset */

  function multiplyText(text, multiplier) {
    const trimmed = text.trim();
    if (!trimmed) return text;

    // The whitespace around it is layout: strip the space off "Read " and the text runs
    // straight into the link beside it.
    const leading = text.match(/^\s*/)[0];
    const trailing = text.match(/\s*$/)[0];

    // A run of several words is repeated with a space between; a single word is repeated
    // against itself, so a long compound stays one unbreakable thing.
    const separator = /\s/.test(trimmed) ? ' ' : '';

    // A whole multiplier repeats the text. Half of one adds half of it and cuts wherever
    // that lands, mid-word if need be — which is the point: that is what a translation
    // running long does to a layout.
    const result = Number.isInteger(multiplier)
      ? (trimmed + separator).repeat(multiplier - 1) + trimmed
      : trimmed + separator + trimmed.substring(0, Math.ceil(trimmed.length * (multiplier - 1)));

    return leading + result + trailing;
  }

  /** Everything back the way it was found, without saying anything about what is applied. */
  function restore() {
    for (const [node, original] of originals) {
      // A node the page threw away in the meantime has nowhere to go back to.
      if (node.isConnected) node.nodeValue = original;
    }
    originals.clear();

    for (const [el, saved] of attrOriginals) {
      if (!el.isConnected) continue;
      for (const [name, original] of Object.entries(saved)) el.setAttribute(name, original);
    }
    attrOriginals.clear();

    for (const [el, style] of highlighted) {
      if (!el.isConnected) continue;
      if (style === null) el.removeAttribute('style');
      else el.setAttribute('style', style);
    }
    highlighted.clear();
  }

  function applyMultiplier(multiplier, options = {}) {
    // Start from a clean page every time. Unticking an attribute or adding an exception
    // then actually takes that work back, rather than leaving the last run's behind, and
    // every original recorded below is the page's own.
    restore();

    const extra = safeSelector(options.skip);
    const attributes = ATTRIBUTES.filter((name) => (options.attributes || []).includes(name));
    const marking = options.highlight === true;
    const colour = COLOUR.test(options.highlightColour || '') ? options.highlightColour : DEFAULT_OUTLINE;

    for (const node of textNodes(document.body, extra)) {
      originals.set(node, node.nodeValue);
      node.nodeValue = multiplyText(node.nodeValue, multiplier);
      if (marking) highlight(node.parentElement, colour);
    }

    if (attributes.length) {
      for (const el of document.body.querySelectorAll(attributes.map((name) => `[${name}]`).join(','))) {
        if (offLimits(el, extra)) continue;
        let touched = false;
        for (const name of attributes) {
          const value = el.getAttribute(name);
          if (!value || !value.trim()) continue;
          const saved = attrOriginals.get(el) || {};
          saved[name] = value;
          attrOriginals.set(el, saved);
          el.setAttribute(name, multiplyText(value, multiplier));
          touched = true;
        }
        if (touched && marking) highlight(el, colour);
      }
    }

    applied = multiplier;
    appliedOptions = { attributes, skip: options.skip || '', highlight: marking, highlightColour: colour };
  }

  function resetText() {
    restore();
    applied = null;
    appliedOptions = null;
  }

  /* ---------------------------------------------------------------- report */

  /**
   * Tell the worker what this page is showing, so the toolbar badge can say so.
   *
   * The page is the only one that knows. Chrome wipes a tab's badge when it navigates,
   * and nothing outside the page can read back what survived that — so this is sent on
   * load and after every change, and the badge follows it.
   */
  function report() {
    try {
      chrome.runtime.sendMessage({ action: 'pageState', multiplier: applied }, () => {
        // Reading it is what stops Chrome logging that nobody answered.
        void chrome.runtime.lastError;
      });
    } catch {
      // The extension was reloaded out from under this page. Nothing to tell it.
    }
  }

  /* ----------------------------------------------------------------- start */

  // Put back on load what this tab had, if the popup was told to keep it.
  const saved = readSaved();
  if (saved) {
    try {
      const state = JSON.parse(saved);
      if (state && state.multiplier) applyMultiplier(state.multiplier, state.options || {});
    } catch {
      clearSaved();
    }
  }

  // A page that came back unchanged already has the badge Chrome cleared for it, so there
  // is no reason to wake the worker for every page load in every tab.
  if (applied) report();

  const remember = () => writeSaved(JSON.stringify({ multiplier: applied, options: appliedOptions }));

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'apply') {
      applyMultiplier(msg.multiplier, msg.options);
      // Applying and remembering in one message, so a refusal to keep it can never arrive
      // after the page has already been changed.
      if (msg.persist) remember();
      else clearSaved();
      report();
      sendResponse({ ok: true });
    } else if (msg.action === 'reset') {
      resetText();
      clearSaved();
      report();
      sendResponse({ ok: true });
    } else if (msg.action === 'persist') {
      // The switch in the popup, both ways. What is on the page stays on the page; this
      // only decides what a refresh leaves behind.
      if (msg.persist && applied) remember();
      else clearSaved();
      sendResponse({ ok: true });
    } else if (msg.action === 'getState') {
      sendResponse({ multiplier: applied });
    }
  });
})();
