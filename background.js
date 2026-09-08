/**
 * Spill — background.js
 *
 * One job: keep the toolbar badge in step with what each tab is actually showing.
 *
 * The page reports that itself. Chrome wipes a tab's badge the moment it navigates, and
 * this worker cannot ask a page anything without a host permission the extension does not
 * want — so content.js says what it ended up with, on load and after every change, and
 * that report is the only thing acted on here.
 *
 * Reading it back off a tab's stored state instead meant guessing when to re-assert the
 * badge from `tabs.onUpdated`, which without the `tabs` permission hands over a
 * changeInfo with the interesting parts taken out. The page knows; let it say so.
 *
 * It also keeps the optional content script in step with the permission that pays for it.
 */

import { ORIGINS, registerPersistentScript, unregisterPersistentScript } from './hostaccess.js';

/**
 * The registered content script follows the permission, wherever that was changed — the
 * switch in the popup, or chrome://extensions taking it back. It lives here rather than in
 * the popup because a popup is gone the moment Chrome's permission dialog opens over it,
 * and because this way the two can never drift apart.
 */
async function syncPersistentScript() {
  if (await chrome.permissions.contains(ORIGINS)) await registerPersistentScript();
  else await unregisterPersistentScript();
}

chrome.runtime.onInstalled.addListener(syncPersistentScript);
chrome.runtime.onStartup.addListener(syncPersistentScript);
chrome.permissions.onAdded.addListener(syncPersistentScript);
chrome.permissions.onRemoved.addListener(syncPersistentScript);

// The brand blue with white on it, the same pair the popup's own buttons use. A badge
// rather than an icon drawn per tab: Chrome sizes and places it for whatever toolbar the
// reader is running, light or dark, which a canvas in a service worker can only guess at.
const BADGE_BG = '#0042ff';
const BADGE_FG = '#ffffff';

// The worker is stopped and started whenever Chrome sees fit, so this runs again on every
// start. Setting a colour that is already set costs nothing.
chrome.action.setBadgeBackgroundColor({ color: BADGE_BG });
chrome.action.setBadgeTextColor?.({ color: BADGE_FG });

// 1.5 is "1,5" to a Dutch reader, the same as on the chip it came from.
const format = (multiplier) =>
  new Intl.NumberFormat(chrome.i18n.getUILanguage()).format(multiplier);

chrome.runtime.onMessage.addListener((message, sender) => {
  // Only a page reports on itself, and only ever about the tab it is sitting in — which
  // Chrome fills in, so a report can never be about someone else's tab.
  if (message?.action !== 'pageState' || !sender.tab) return;

  chrome.action
    .setBadgeText({ tabId: sender.tab.id, text: message.multiplier ? format(message.multiplier) : '' })
    .catch(() => {
      // The tab closed between the report and this call. Nothing left to label.
    });
});
