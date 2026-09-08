/**
 * The coordinator: owns the settings, the multiplier choice and the two buttons, hands
 * the Settings panel a way to change things, and does the talking to the content script.
 *
 * It is the only writer of `settings`. The panel reads through `read()` and asks for
 * changes through `update()`, so there is never a second copy to drift from the store.
 */

import { t, number, uiLanguage } from './i18n.js';
import { AUTHOR, authorUrl } from './links.js';
import { loadSettings, saveSettings, pageOptions } from './settings.js';
import { renderSettings } from './settings-panel.js';
import { ORIGINS, hasHostAccess } from './hostaccess.js';
import { $, h, showError, clearError, flashDone, announce } from './ui.js';

let settings = null;
let multiplier = null;
/** What the page itself has, as opposed to what is merely selected here. */
let appliedMultiplier = null;
let tab = null;

/* ------------------------------------------------------------------- page */

// Everything else — chrome://, the Web Store, the PDF viewer, view-source: — is a page
// Chrome does not let an extension touch. The few that slip through this test still fail
// at injection, and are caught there.
const canRun = (url) => /^(https?|file):/i.test(url || '');

/**
 * The page cannot be changed. `permanent` also clears the popup: on a page Chrome will
 * never allow, the tabs and the panels are no use and the message is left carrying it on
 * its own. A page that merely did not answer might well answer next time, so that one
 * keeps everything.
 */
function refuse({ reasons, permanent = false }) {
  showError(t('uiErrCannotRun'), ...reasons);
  if (!permanent) return;
  $('.sp-tabs').hidden = true;
  for (const panel of document.querySelectorAll('.sp-panel')) panel.hidden = true;
}

/* -------------------------------------------------------------- messaging */

/**
 * A page with no content script — one that was open before the extension was loaded, or
 * one Chrome will not have it on — answers nothing at all. Reading lastError is what
 * keeps Chrome from logging that as an error nobody handled.
 */
const send = (message) => new Promise((resolve) => {
  chrome.tabs.sendMessage(tab.id, message, (response) => {
    resolve(chrome.runtime.lastError ? null : (response ?? null));
  });
});

/**
 * content.js is declared for every page, but a tab that was already open when the
 * extension was installed or reloaded never got it. Injecting it once here is what makes
 * Apply work on the tab you are looking at without refreshing it first. The script guards
 * against running twice, so this costs nothing when it is already there.
 *
 * Returns Chrome's own words on failure, and nothing at all on success.
 */
async function ensureContentScript() {
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    return null;
  } catch (error) {
    return error?.message || String(error);
  }
}

/* ----------------------------------------------------------------- render */

function chipFactors() {
  const factors = new Set(settings.factors);
  // The page may be showing a factor that has since been taken out of the list. It is
  // still what is on the page, so it is still a chip.
  if (appliedMultiplier != null) factors.add(appliedMultiplier);
  return [...factors].sort((a, b) => a - b);
}

function renderChips() {
  const factors = chipFactors();
  // The factor that was selected may have just been removed in Settings.
  if (!factors.includes(multiplier)) multiplier = factors[0];

  $('#sp-mults').replaceChildren(...factors.map((value) => h('button', {
    class: 'sp-chip',
    text: t('uiMultiplierValue', number(value)),
    attrs: { type: 'button', 'aria-pressed': String(value === multiplier) },
    props: {
      onclick: () => {
        multiplier = value;
        renderChips();
        renderPreview();
      },
    },
  })));
}

/**
 * The same rule content.js applies, on two words. Written out a second time rather than
 * shared: a content script declared in the manifest cannot import a module, and a build
 * step to spare six lines would be the more expensive answer.
 */
function renderPreview() {
  const sample = t('uiSample');
  const separator = /\s/.test(sample) ? ' ' : '';
  const added = Number.isInteger(multiplier)
    ? (separator + sample).repeat(multiplier - 1)
    : separator + sample.substring(0, Math.ceil(sample.length * (multiplier - 1)));

  $('#sp-preview').replaceChildren(
    h('span', { class: 'sp-sample__was', text: sample }),
    h('span', { class: 'sp-sample__added', text: added }));
}

/* --------------------------------------------------------------- settings */

/**
 * Every change from the Settings panel comes through here. Redrawing the Multiply panel
 * afterwards is cheaper than working out which setting touched what, and it is three
 * chips and a line of sample text.
 */
async function update(patch) {
  settings = { ...settings, ...patch };
  await saveSettings(settings);
  renderChips();
  renderPreview();
}

/* ------------------------------------------------------------------- tabs */

function setupTabs() {
  const tabs = [...document.querySelectorAll('.sp-tab')];
  const select = (target) => {
    for (const other of tabs) {
      const selected = other === target;
      other.setAttribute('aria-selected', String(selected));
      other.tabIndex = selected ? 0 : -1;
      $(`#${other.getAttribute('aria-controls')}`).hidden = !selected;
    }
    target.focus();
  };
  tabs.forEach((thisTab, index) => {
    thisTab.addEventListener('click', () => select(thisTab));
    thisTab.addEventListener('keydown', (event) => {
      const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      event.preventDefault();
      select(tabs[(index + step + tabs.length) % tabs.length]);
    });
  });
}

/* ---------------------------------------------------------------- actions */

async function apply() {
  clearError();
  const failed = await ensureContentScript();
  if (failed) return refuse({ reasons: [t('uiErrInternalPages'), failed], permanent: true });

  const persist = $('#sp-remember').checked;
  const answered = await send({ action: 'apply', multiplier, persist, options: pageOptions(settings) });
  if (!answered) return refuse({ reasons: [t('uiErrNoAnswer')] });

  appliedMultiplier = multiplier;
  flashDone($('#sp-apply'));
  announce(t('uiStatusApplied', number(multiplier)));
}

async function reset() {
  clearError();
  const failed = await ensureContentScript();
  if (failed) return refuse({ reasons: [t('uiErrInternalPages'), failed], permanent: true });

  if (!await send({ action: 'reset' })) return refuse({ reasons: [t('uiErrNoAnswer')] });

  appliedMultiplier = null;
  multiplier = settings.factors[0];
  renderChips();
  renderPreview();
  flashDone($('#sp-reset'));
  announce(t('uiStatusReset'));
}

/**
 * The switch is the permission. Nothing is stored beside it, so there is nothing that can
 * come to disagree with what Chrome actually granted.
 *
 * Note the first thing in the on-branch is the request itself: an `await` before it would
 * spend the click that makes it allowed to ask.
 */
async function rememberChanged() {
  const box = $('#sp-remember');
  clearError();

  if (!box.checked) {
    await chrome.permissions.remove(ORIGINS);
    if (tab) await send({ action: 'persist', persist: false });
    return;
  }

  const granted = await chrome.permissions.request(ORIGINS);
  if (!granted) {
    box.checked = false;
    showError(t('uiErrNoAccess'), t('uiErrNoAccessWhy'));
    return;
  }

  // On some platforms Chrome closes this popup as it opens the dialog, and then none of
  // what follows runs. The worker registers the script off permissions.onAdded regardless,
  // so the only thing lost is the note on the page already open — press Apply again and it
  // is written.
  if (tab) await send({ action: 'persist', persist: true });
}

/* ------------------------------------------------------------------ start */

function applyStaticStrings() {
  // The popup is translated, so the document has to say which language it ended up in.
  // WCAG 3.1.1 — the same rule this extension exists to help people test.
  document.documentElement.lang = uiLanguage();
  document.title = t('appShortName');
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-label]')) el.setAttribute('aria-label', t(el.dataset.i18nLabel));

  const link = $('#sp-author');
  link.textContent = `${AUTHOR.name}, ${t('uiAuthorRole')}`;
  const url = authorUrl();
  // No page for it yet? Then no link at all, rather than one that lands on a 404.
  if (url) link.href = url;
  else link.replaceWith(h('span', { class: 'sp-foot__link', text: link.textContent }));
}

async function start() {
  settings = await loadSettings();
  multiplier = settings.factors[0];

  applyStaticStrings();
  setupTabs();
  renderChips();
  renderPreview();
  renderSettings(() => settings, update);

  // Wired before the tab is known, so a very quick click cannot fall through the gap.
  $('#sp-apply').addEventListener('click', apply);
  $('#sp-reset').addEventListener('click', reset);
  $('#sp-remember').checked = await hasHostAccess();
  $('#sp-remember').addEventListener('change', rememberChanged);

  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !canRun(tab.url)) return refuse({ reasons: [t('uiErrInternalPages')], permanent: true });

  const failed = await ensureContentScript();
  if (failed) return refuse({ reasons: [t('uiErrInternalPages'), failed], permanent: true });

  // What the page is showing right now, so the chips open on the multiplier you are
  // looking at rather than on the first factor in the list.
  const state = await send({ action: 'getState' });
  if (!state || !state.multiplier) return;
  appliedMultiplier = state.multiplier;
  multiplier = state.multiplier;
  renderChips();
  renderPreview();
}

start();
