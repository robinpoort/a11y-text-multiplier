/**
 * The Settings panel: which factors the chips offer, which attributes are rewritten
 * alongside the text, what to leave alone, and whether the result is outlined.
 *
 * It holds no copy of the settings. `read` hands it the current ones and `update` takes
 * a patch — both belong to the coordinator in popup.js, and importing them here would put
 * a cycle in the module graph for the sake of two calls.
 *
 * Only the factor list is rebuilt when something changes. Redrawing the whole panel on
 * every click would throw away the focus you were using it with.
 */

import { $, h, crossIcon, plusIcon, flashDone } from './ui.js';
import { t, number } from './i18n.js';
import {
  ATTRIBUTES, MIN_FACTOR, MAX_FACTOR, MAX_FACTORS,
  cleanFactor, isValidSelector, isPanelDefault, panelDefaults,
} from './settings.js';

const section = (title, id, ...children) => h('section', { class: 'sp-section' },
  h('h2', { class: 'sp-section__head', attrs: { id }, text: title }),
  ...children);

export function renderSettings(read, update) {
  // Everything the panel changes goes through here rather than straight to `update`, so
  // the Restore button always knows whether there is anything left to restore.
  const change = async (patch) => {
    await update(patch);
    syncReset();
  };

  /* ---------------------------------------------------------------- factors */

  const factorList = h('div', { class: 'sp-chips', attrs: { role: 'group', 'aria-labelledby': 'sp-set-factors' } });
  const factorNote = h('p', { class: 'sp-note sp-note--warn', attrs: { role: 'alert' }, props: { hidden: true } });

  const factorField = h('input', {
    class: 'sp-field sp-field--number',
    attrs: {
      type: 'number',
      min: String(MIN_FACTOR),
      max: String(MAX_FACTOR),
      step: '0.05',
      placeholder: '1.35',
      'aria-label': t('uiSettingsFactorNew'),
    },
  });

  const complain = (message) => {
    factorNote.textContent = message;
    factorNote.hidden = !message;
  };

  /**
   * The field is not a standing invitation. It lives behind the + at the end of the row,
   * because a filled-in number box beside a blue Add button is the loudest thing in the
   * panel and asks to be used, which is not what adding a factor is for.
   */
  function setAddOpen(open, { move = true } = {}) {
    addRow.hidden = !open;
    addChip.setAttribute('aria-expanded', String(open));
    complain('');
    if (open) factorField.value = '';
    if (!move) return;
    if (open) return factorField.focus();
    // The chip may have just become the disabled one at the end of a full list, and focus
    // has to land on something that can hold it.
    (addChip.disabled ? factorList.querySelector('.sp-chip:not(:disabled)') : addChip).focus();
  }

  async function renderFactors() {
    const factors = read().factors;
    const full = factors.length >= MAX_FACTORS;

    // Disabled rather than gone, so a full list says so instead of quietly losing its +.
    addChip.disabled = full;
    const label = full ? t('uiSettingsFactorMax', String(MAX_FACTORS)) : t('uiSettingsFactorAdd');
    addChip.setAttribute('aria-label', label);
    addChip.title = label;
    if (full) setAddOpen(false, { move: false });

    factorList.replaceChildren(...factors.map((factor) => h('button', {
      class: 'sp-chip sp-chip--remove',
      attrs: { type: 'button', 'aria-label': t('uiSettingsFactorRemove', number(factor)) },
      props: {
        // One has to survive, or the Multiply panel has nothing to offer.
        disabled: factors.length < 2,
        onclick: async () => {
          await change({ factors: factors.filter((other) => other !== factor) });
          complain('');
          await renderFactors();
          // The chip you pressed is gone; land on something that still exists rather
          // than dropping focus back to the top of the panel.
          (factorList.querySelector('.sp-chip:not(:disabled)') || factorField).focus();
        },
      },
    },
      h('span', { text: t('uiMultiplierValue', number(factor)) }),
      crossIcon())), addChip);
  }

  async function addFactor() {
    const { factors } = read();
    // valueAsNumber already knows what a decimal comma means here; the fallback is for
    // a value the field would not parse at all.
    const typed = Number.isFinite(factorField.valueAsNumber)
      ? factorField.valueAsNumber
      : Number(factorField.value.replace(',', '.'));
    const factor = cleanFactor(typed);

    if (factor === null) return complain(t('uiSettingsFactorRange', number(MIN_FACTOR), number(MAX_FACTOR)));
    if (factors.includes(factor)) return complain(t('uiSettingsFactorExists'));
    // The + is already disabled at this point, so this is the rule rather than the way it
    // is normally met — and a rule that lives only in a disabled attribute is not one.
    if (factors.length >= MAX_FACTORS) return complain(t('uiSettingsFactorMax', String(MAX_FACTORS)));

    await change({ factors: [...factors, factor].sort((a, b) => a - b) });
    await renderFactors();
    setAddOpen(false);
  }

  const addButton = h('button', {
    class: 'sp-btn sp-btn--compact',
    attrs: { type: 'button' },
    text: t('uiSettingsFactorAdd'),
    props: { onclick: addFactor },
  });

  // Field, button and whatever the field has to say about itself, in one tinted block:
  // it is then obvious that they belong together, and where what you just opened ends.
  const addRow = h('div', { class: 'sp-well', attrs: { id: 'sp-set-addrow' }, props: { hidden: true } },
    h('button', {
      class: 'sp-well__close',
      attrs: { type: 'button', 'aria-label': t('uiClose') },
      props: { onclick: () => setAddOpen(false) },
    }, crossIcon('sp-well__icon')),
    h('div', { class: 'sp-addrow' }, factorField, addButton),
    factorNote);

  const addChip = h('button', {
    class: 'sp-chip sp-chip--add',
    attrs: { type: 'button', 'aria-expanded': 'false', 'aria-controls': 'sp-set-addrow' },
    props: { onclick: () => setAddOpen(addRow.hidden) },
  }, plusIcon());

  // Enter in a number field would submit a form if there were one; here it has to be
  // wired by hand, and it must not reach the tab bar's own key handling.
  factorField.onkeydown = (event) => {
    // Escape is the way back out for anyone who opened the row and thought better of it,
    // and it must not reach the popup, which Chrome would close on it.
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      return setAddOpen(false);
    }
    if (event.key !== 'Enter') return;
    event.preventDefault();
    addFactor();
  };

  /* ------------------------------------------------------------- attributes */

  // The same shape as the check-all groups in Unfurl: one master over the list, kept in
  // step with it rather than rebuilt, so neither loses focus to the other.
  const master = h('input', { attrs: { type: 'checkbox' } });

  const rows = ATTRIBUTES.map((name) => {
    const box = h('input', { attrs: { type: 'checkbox' } });
    box.onchange = async () => {
      const chosen = new Set(read().attributes);
      if (box.checked) chosen.add(name);
      else chosen.delete(name);
      await change({ attributes: ATTRIBUTES.filter((each) => chosen.has(each)) });
      syncMaster();
    };
    return { name, box, el: h('label', { class: 'sp-switch' }, box, h('code', { class: 'sp-code', text: name })) };
  });

  function syncMaster() {
    const on = read().attributes.length;
    master.checked = on === ATTRIBUTES.length;
    master.indeterminate = on > 0 && on < ATTRIBUTES.length;
    for (const row of rows) row.box.checked = read().attributes.includes(row.name);
  }

  master.onchange = async () => {
    await change({ attributes: master.checked ? [...ATTRIBUTES] : [] });
    syncMaster();
  };

  /* ------------------------------------------------------------------- skip */

  const skipNote = h('p', { class: 'sp-note sp-note--warn', attrs: { role: 'alert' }, props: { hidden: true } });

  const skipField = h('input', {
    class: 'sp-field',
    attrs: {
      type: 'text',
      spellcheck: 'false',
      autocapitalize: 'off',
      autocomplete: 'off',
      placeholder: t('uiSettingsSkipPlaceholder'),
      'aria-label': t('uiSettingsSkip'),
    },
    props: { value: read().skip },
  });

  // On change rather than on every keystroke: half a selector is not a selector, and
  // complaining about one while it is still being typed is noise.
  skipField.onchange = async () => {
    const value = skipField.value.trim();
    const ok = isValidSelector(value);
    skipField.setAttribute('aria-invalid', String(!ok));
    skipNote.textContent = ok ? '' : t('uiSettingsSkipInvalid');
    skipNote.hidden = ok;
    if (ok) await change({ skip: value });
  };

  /* -------------------------------------------------------------- highlight */

  const highlightBox = h('input', { attrs: { type: 'checkbox' }, props: { checked: read().highlight } });
  highlightBox.onchange = async () => {
    await change({ highlight: highlightBox.checked });
    syncColour();
  };

  const colourField = h('input', {
    class: 'sp-swatch',
    attrs: { type: 'color', 'aria-label': t('uiSettingsHighlightColour') },
    props: { value: read().highlightColour },
  });
  colourField.onchange = () => change({ highlightColour: colourField.value });

  // Out of reach while nothing is being outlined, so the row cannot be mistaken for a
  // second thing to switch on.
  const syncColour = () => {
    colourField.disabled = !read().highlight;
    colourField.value = read().highlightColour;
  };

  /* --------------------------------------------------------------- restore */

  const resetButton = h('button', {
    class: 'sp-btn sp-btn--ghost sp-btn--compact',
    attrs: { type: 'button' },
    props: {
      onclick: async () => {
        await change(panelDefaults());
        syncAll();
        flashDone(resetButton);
      },
    },
  },
    h('span', { class: 'sp-btn__labels' },
      h('span', { class: 'sp-btn__label', text: t('uiSettingsReset') }),
      h('span', {
        class: 'sp-btn__label sp-btn__label--done',
        attrs: { 'aria-hidden': 'true' },
        text: t('uiSettingsResetDone'),
      })));

  // Nothing to put back is a reason to say so, not a reason to let someone press it and
  // wonder whether it worked.
  function syncReset() {
    resetButton.disabled = isPanelDefault(read());
  }

  /** Every control back in step with the store at once, which is what Restore needs. */
  function syncAll() {
    renderFactors();
    setAddOpen(false, { move: false });
    complain('');
    syncMaster();
    skipField.value = read().skip;
    skipField.removeAttribute('aria-invalid');
    skipNote.hidden = true;
    highlightBox.checked = read().highlight;
    syncColour();
    syncReset();
  }

  /* ------------------------------------------------------------------ build */

  syncMaster();
  syncColour();
  syncReset();
  renderFactors();

  $('#panel-settings').replaceChildren(
    section(t('uiSettingsFactors'), 'sp-set-factors',
      factorList,
      addRow,
      h('p', { class: 'sp-note', text: t('uiSettingsFactorsNote') })),

    section(t('uiSettingsAttributes'), 'sp-set-attributes',
      h('div', { class: 'sp-switches', attrs: { role: 'group', 'aria-labelledby': 'sp-set-attributes' } },
        h('label', { class: 'sp-switch sp-switch--all' }, master, h('span', { text: t('uiAll') })),
        ...rows.map((row) => row.el)),
      h('p', { class: 'sp-note', text: t('uiSettingsAttributesNote') })),

    section(t('uiSettingsSkip'), 'sp-set-skip',
      skipField,
      skipNote,
      h('p', { class: 'sp-note', text: t('uiSettingsSkipNote') })),

    section(t('uiSettingsHighlight'), 'sp-set-highlight',
      h('div', { class: 'sp-switches' },
        h('label', { class: 'sp-switch' }, highlightBox, h('span', { text: t('uiSettingsHighlightLabel') }))),
      h('label', { class: 'sp-swatchrow' }, colourField, h('span', { text: t('uiSettingsHighlightColour') })),
      h('p', { class: 'sp-note', text: t('uiSettingsHighlightNote') })),

    h('div', { class: 'sp-panelfoot' },
      resetButton,
      h('p', { class: 'sp-note', text: t('uiSettingsNote') })));
}
