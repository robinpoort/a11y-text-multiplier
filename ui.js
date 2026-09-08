/**
 * The pieces the popup needs to build and update itself: element building, the error
 * box, the button that confirms itself, and the live region.
 *
 * Nothing here knows what a multiplier is. That is the point.
 */

const $ = (selector) => document.querySelector(selector);

function h(tag, options = {}, ...children) {
  const node = document.createElement(tag);
  if (options.class) node.className = options.class;
  if (options.text != null) node.textContent = options.text;
  for (const [name, value] of Object.entries(options.attrs || {})) {
    // Note: '' must be set. alt="" is how you say "decorative"; leaving the
    // attribute off makes screen readers announce the file name instead.
    if (value != null) node.setAttribute(name, value);
  }
  for (const [name, value] of Object.entries(options.props || {})) node[name] = value;
  for (const child of children.flat(Infinity)) if (child) node.append(child);
  return node;
}

/**
 * The heading first, then a line per reason: ours in plain words, and under it whatever
 * Chrome itself said, in its own language rather than run together with our sentence.
 */
/**
 * A drawn cross, not a "×". The chip beside it already ends in a multiplication sign, and
 * two of them in a row read as one confused label rather than as a label and a control.
 * Strokes are symmetric about the middle of the viewBox, so it sits centred whatever size
 * it is given.
 */
function crossIcon(className = 'sp-chip__x') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M5 5 L15 15 M15 5 L5 15');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2.6');
  path.setAttribute('stroke-linecap', 'round');
  svg.append(path);
  return svg;
}

/** Its sibling above, the other way round. Same construction, same optical weight. */
function plusIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'sp-chip__plus');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M10 4 V16 M4 10 H16');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2.6');
  path.setAttribute('stroke-linecap', 'round');
  svg.append(path);
  return svg;
}

function showError(message, ...reasons) {
  const box = $('#sp-error');
  box.replaceChildren(
    h('span', { text: message }),
    ...reasons.filter(Boolean).map((reason) => h('span', { class: 'sp-error__reason', text: reason })));
  box.hidden = false;
}

const clearError = () => { $('#sp-error').hidden = true; };

/**
 * The second label rises into place for a moment and then leaves again. One timer per
 * button, not one shared: pressing the other button would otherwise cancel this one's
 * reset and leave it reading "Applied" for good.
 */
const doneTimers = new WeakMap();

function flashDone(button) {
  button.dataset.done = '';
  clearTimeout(doneTimers.get(button));
  doneTimers.set(button, setTimeout(() => {
    delete button.dataset.done;
    doneTimers.delete(button);
  }, 1500));
}

/**
 * The swap above is a transform, which a screen reader has nothing to say about, so the
 * same news goes to the live region in words.
 */
const announce = (message) => { $('#sp-status').textContent = message; };

export { $, h, crossIcon, plusIcon, showError, clearError, flashDone, announce };
