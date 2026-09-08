/**
 * Thin wrapper around chrome.i18n so the rest of the code stays readable. Falls back to
 * the key itself, which makes a missing translation immediately visible instead of
 * silently empty.
 */

const api = (typeof chrome !== 'undefined' && chrome.i18n) ? chrome.i18n : null;

export const t = (key, ...substitutions) =>
  (api ? api.getMessage(key, substitutions.map(String)) : '') || key;

export const uiLanguage = () => (api && api.getUILanguage ? api.getUILanguage() : 'en');

export const isDutch = () => uiLanguage().toLowerCase().startsWith('nl');

/**
 * 1.5 is "1,5" to a Dutch reader. The multipliers are numbers the popup shows, not ids,
 * so they are formatted rather than printed — the id stays the JavaScript number.
 */
export const number = (value) => new Intl.NumberFormat(uiLanguage()).format(value);
