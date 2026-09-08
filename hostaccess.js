/**
 * The one broad permission Spill can ask for, and the content script it pays for.
 *
 * Multiplying and resetting need nothing standing: the popup injects `content.js` into the
 * tab you are looking at under `activeTab`, which Chrome grants because you clicked the
 * icon. Keeping a multiplier through a refresh is the exception — that means running on a
 * page before anyone has clicked anything, and `activeTab` is revoked the moment a tab
 * navigates. There is no way around it: storage is passive, and something has to run.
 *
 * So it is optional, and asked for at the moment it is needed rather than at install time,
 * where "read and change all your data on all websites" is the whole of what someone sees
 * before they know what the extension is for.
 *
 * The granted permission is the setting. Nothing is stored alongside it that could come to
 * disagree with it — revoke it from chrome://extensions and the switch is simply off the
 * next time the popup opens.
 */

export const ORIGINS = { origins: ['<all_urls>'] };

const SCRIPT_ID = 'spill-persist';

export const hasHostAccess = () => chrome.permissions.contains(ORIGINS);

/**
 * Registered rather than declared in the manifest, because a manifest content script is
 * a permission whether or not the feature it serves is ever switched on.
 */
export async function registerPersistentScript() {
  try {
    const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
    if (existing.length) return;
    await chrome.scripting.registerContentScripts([{
      id: SCRIPT_ID,
      matches: ['<all_urls>'],
      js: ['content.js'],
      runAt: 'document_idle',
    }]);
  } catch {
    // Registering without the permission, or twice over. Either way there is nothing to
    // do but leave the feature off.
  }
}

export async function unregisterPersistentScript() {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
  } catch {
    // Not registered. Which is the state this was asking for.
  }
}
