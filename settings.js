/**
 * What the user chose, and where it is kept.
 *
 * `chrome.storage.local` rather than localStorage, because the badge already needs the
 * `storage` permission for its per-tab state — so there is nothing to win back here, and
 * this is the API that survives whatever Chrome decides to do with extension pages.
 *
 * Everything is validated on the way in. A value from an older version, a hand-edited
 * store or a write that was cut in half should cost you one setting, never the popup.
 */

const KEY = 'settings';

/** At or below 1 a factor adds nothing; past 10 the page stops being a page. */
export const MIN_FACTOR = 1.1;
export const MAX_FACTOR = 10;
/** Six chips still fit on two rows at this width. */
export const MAX_FACTORS = 6;

/** Loud on purpose: an outline drawn over someone else's page has to be unmistakably
    not theirs. Must stay in step with DEFAULT_OUTLINE in content.js, which cannot
    import this. */
export const DEFAULT_COLOUR = '#ff00ff';

const COLOUR = /^#[0-9a-f]{6}$/i;

/** The attributes worth rewriting, in the order the panel lists them. */
export const ATTRIBUTES = ['placeholder', 'title', 'alt', 'aria-label'];

export const DEFAULTS = {
  factors: [1.5, 2, 3],
  /**
   * All four off. A text node is what the page shows; an attribute is text it hands to a
   * tooltip or to a screen reader. Rewriting those is worth doing and is why the switches
   * are here, but it is something you ask for rather than something you discover.
   */
  attributes: [],
  skip: '',
  highlight: false,
  highlightColour: DEFAULT_COLOUR,
};

/**
 * What the Settings panel owns, and therefore what its Restore button puts back — which
 * happens to be all of it. "Keep it after a refresh" is not stored here at all: it is a
 * granted permission, and hostaccess.js says why.
 */
const PANEL_KEYS = ['factors', 'attributes', 'skip', 'highlight', 'highlightColour'];

export const panelDefaults = () => Object.fromEntries(
  PANEL_KEYS.map((key) => [key, structuredClone(DEFAULTS[key])]));

/**
 * Both sides are canonical by the time they get here — factors sorted, attributes in the
 * order of ATTRIBUTES — so comparing the written form is enough and needs no deep equal.
 */
export const isPanelDefault = (settings) =>
  PANEL_KEYS.every((key) => JSON.stringify(settings[key]) === JSON.stringify(DEFAULTS[key]));

/** Two decimals is as fine as this gets: 1.35 is a real target, 1.3512 is a typo. */
export function cleanFactor(value) {
  const factor = Math.round(Number(value) * 100) / 100;
  if (!Number.isFinite(factor) || factor < MIN_FACTOR || factor > MAX_FACTOR) return null;
  return factor;
}

function cleanFactors(list) {
  if (!Array.isArray(list)) return [...DEFAULTS.factors];
  const clean = [...new Set(list.map(cleanFactor).filter((factor) => factor !== null))];
  // Ascending, whatever order they were added in: the chips are a scale, not a history.
  clean.sort((a, b) => a - b);
  return clean.length ? clean.slice(0, MAX_FACTORS) : [...DEFAULTS.factors];
}

/** Chrome is the judge of what is a selector, so ask it rather than write a parser. */
export function isValidSelector(selector) {
  if (!selector.trim()) return true;
  try {
    document.querySelector(selector);
    return true;
  } catch {
    return false;
  }
}

export async function loadSettings() {
  try {
    const stored = (await chrome.storage.local.get(KEY))[KEY];
    if (!stored || typeof stored !== 'object') return { ...DEFAULTS };
    return {
      factors: cleanFactors(stored.factors),
      // Filtered through the known list rather than trusted: an attribute dropped in a
      // later version must not go on being rewritten because a store still names it.
      attributes: ATTRIBUTES.filter((name) => Array.isArray(stored.attributes) && stored.attributes.includes(name)),
      skip: typeof stored.skip === 'string' ? stored.skip : '',
      highlight: stored.highlight === true,
      highlightColour: COLOUR.test(stored.highlightColour || '')
        ? stored.highlightColour.toLowerCase()
        : DEFAULT_COLOUR,
    };
  } catch {
    // No store at all, or one that refused: everything on its default, popup working.
    return { ...DEFAULTS };
  }
}

export async function saveSettings(settings) {
  try {
    await chrome.storage.local.set({ [KEY]: settings });
  } catch {
    // Storage disabled. The choice still applies while the popup is open, it just will
    // not be there the next time.
  }
}

/**
 * The part the content script needs, and only that part. The factors are the popup's own
 * business and have nothing to do on the page.
 */
export const pageOptions = (settings) => ({
  attributes: settings.attributes,
  skip: settings.skip,
  highlight: settings.highlight,
  highlightColour: settings.highlightColour,
});
