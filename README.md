# Spill

Chrome extension (MV3) that multiplies the text on the page you are on, so you can see
which components break when a translation runs long. German is routinely a third longer
than English, and a button that only fits its own label is a button that will break on the
first translation nobody tested.

## Install

1. `chrome://extensions` → turn on **Developer mode**.
2. **Load unpacked** → pick this folder.
3. Pin the icon to the toolbar.

## Use

Click the icon. Two tabs:

- **Multiply**: pick a factor, press **Apply**. **1.5×** repeats half the text and cuts
  wherever that lands, mid-word if need be — that is the point, it is what a long
  translation does to a layout. **2×** and **3×** repeat it whole. A run of several words
  is repeated with a space between them; a single word is repeated against itself, so a
  long compound stays one unbreakable thing. **Reset** puts every word back exactly as it
  was. **Keep it after a refresh** survives a reload, so you can multiply a page and then
  walk through a flow; it holds for that one tab and is gone the moment you close it. It
  is the one thing here that needs permission to run on the pages you visit, so Chrome asks
  the first time you switch it on. The **?** beside it says why, in a popover; the section
  below says it at length.
- **Settings**: four groups, kept on this device and used the next time you press Apply.

While a tab is multiplied its badge shows the factor, so a tab you left changed an hour
ago still says so.

### Settings

- **Factors** — which factors the chips offer. Press one to take it off the list; press the
  **+** at the end of the row to open a field and add one. The field stays behind that +
  rather than standing open, because a number box beside a blue Add button is the loudest
  thing in the panel and asks to be used, which is not what adding a factor is for. What
  it opens is one tinted block holding the field, the button and whatever the field has to
  say about itself, with a close in its corner — so it is obvious what belongs to what and
  where the thing you just opened ends. Between
  1.1 and 10, six at most, and one has to survive. The three you start with are round
  numbers rather than measured ones: short German labels run about 1.35× the length of
  their English originals, which is worth adding.
- **Attributes** — `placeholder`, `title`, `alt` and `aria-label`, each on its own switch.
  All off to begin with. A text node is what the page shows; an attribute is what it hands
  to a tooltip or a screen reader. `placeholder` and `title` change the layout, `alt` and
  `aria-label` test whether a label gets too long to listen to. Rewriting them is worth
  doing, but it is a thing you ask for rather than a thing you discover.
- **Leave alone** — extra CSS selectors, comma separated, on top of what is always left
  alone. Stops code samples on your own site turning into unreadable soup.
- **Highlight** — outlines everything that got longer, which is also how you see what was
  *not* reached: text drawn from CSS, an attribute you left switched off, or anything
  inside an iframe stays as it was. Magenta by default, because an outline drawn over
  someone else's page has to be unmistakably not theirs on a light page and on a dark one;
  the colour well beside the switch changes it.

**Restore defaults** at the foot of the panel puts all four back. It is disabled while
nothing differs from the defaults, so it never leaves you wondering whether it did
anything. It deliberately leaves **Keep it after a refresh** alone: that is a control on
the other tab, and resetting something you cannot see from where you pressed is a surprise
rather than a service.

## How it works

`content.js` walks the text nodes under `<body>` and multiplies each one. Before it
touches a node it records that node's original in a `Map` keyed by the node itself.

That key matters. The first version kept the original in a `data-a11y-original` attribute
on the parent element, and an element can hold more than one text node —
`<p>Read <a>more</a> here</p>` gives the paragraph two. The second node then read the
first one's original as its own, so `" here"` was overwritten with `"Read "` and no reset
could bring it back. An inline link in a paragraph is about the most ordinary markup there
is, so it went wrong on nearly every page.

Attributes are recorded the same way, per element per attribute. The outline is set in the
element's own `style` attribute as an `!important` declaration, and the whole attribute as
it stood — including there being none at all — is what gets put back. A stylesheet of our
own was the first attempt and was wrong twice over: a rule written with one class loses to
any page rule that is both more specific and `!important`, and `outline: none !important`
on something like `#main p` is a common enough focus reset that the outline simply never
appeared. An important declaration in the style attribute is the top of the author cascade,
and it is also out of reach of a page's `style-src`.

Every apply starts by putting the page back first. That is what makes unticking an
attribute or adding an exception actually take the work back, rather than leaving the last
run's behind, and it means every original recorded afterwards is the page's own.

Always left alone, whatever the settings say: `script`, `style`, `noscript`, `textarea`,
`input`, and anything inside a `contenteditable` — a document the reader may go on to
save. The tag list is only about text, though: an input's `placeholder` is neither markup
nor something the reader typed, so it is rewritten when that switch is on.

## Files

| File | Responsibility |
| --- | --- |
| `content.js` | Walks the page, multiplies text and attributes, holds every original so reset is exact. |
| `background.js` | Sets the toolbar badge from what the page reports. Twenty lines, and that is all of it. |
| `popup.js` | The coordinator. Owns the settings, the factor choice and the buttons, and talks to the content script. The only writer of the settings. |
| `settings-panel.js` | The Settings panel: four groups and the restore button. Holds no copy of the settings. |
| `settings.js` | What the user chose, where it is kept, and what counts as valid on the way back in. |
| `hostaccess.js` | The one optional permission, and the content script it pays for. |
| `ui.js` | Element building, the icons, the error box, the button that confirms itself, the live region. |
| `i18n.js` | Thin wrapper around `chrome.i18n`, plus locale-aware number formatting. |
| `links.js` | Everything pointing at robinpoort.com, so URLs are changed in one place. |
| `_locales/{en,nl}/messages.json` | Every string in the extension. |
| `style.css` | All styling: tokens, popup chrome, and the panels' own parts. |
| `fonts/` | Barlow Semi Condensed (bold, woff2), bundled rather than fetched. Only for the small uppercase labels. |
| `icons/` | The toolbar and store icon, five sizes. |

Nothing imports `popup.js`, so the module graph has no cycles: the panel depends on the
shared modules and on a `read`/`update` pair handed to it, never on the coordinator.

`content.js` is a plain IIFE rather than a module, because a content script declared in
the manifest cannot use `import`. That is why the multiply rule is written out a second
time in `popup.js` for the preview: a build step to share six lines would cost more than
it saves.

## Permissions

`activeTab`, `scripting` and `storage`. Installing Spill shows no permission warning at
all.

Multiplying and resetting need nothing standing. The popup injects `content.js` into the
tab you are looking at through `chrome.scripting`, which works under `activeTab` because
you clicked the icon — so nothing is read and nothing runs until you ask for it, and it
works on staging, on localhost and behind a login. `storage` holds the settings, and
nothing else. The service worker never reads a tab URL and never messages a page, so there
is no `tabs` permission either.

**Keep it after a refresh** is the exception, and the reason `<all_urls>` is listed under
`optional_host_permissions` rather than as a manifest content script. Putting the text back
after a reload means running on a page before anyone has clicked anything, and `activeTab`
is revoked the moment a tab navigates. Storage cannot stand in for it: the note the page
leaves itself in `sessionStorage` is only useful if something is there to read it.

So the permission is asked for at the switch, not at install. Granting it registers the
content script through `chrome.scripting.registerContentScripts`; switching it off
unregisters and hands the permission back. The registration follows the permission from
the service worker — `permissions.onAdded`, `onRemoved`, `onStartup`, `onInstalled` — so
revoking it from `chrome://extensions` reaches the same place, and the switch is simply off
the next time the popup opens. Nothing is stored beside it that could come to disagree with
it: the granted permission *is* the setting.

The alternative was a manifest content script on `<all_urls>`, which is a permission
whether or not the feature it serves is ever switched on, and which greets everyone at
install with "read and change all your data on all websites" before they know what the
extension is for.

## The badge

Chrome wipes a tab's badge the moment that tab navigates, and the worker cannot ask a page
what survived without a host permission this extension does not want. So the page says it
itself: `content.js` reports what it ended up with, on load and after every change, and
`background.js` does nothing but turn that into badge text.

Reading it back off stored per-tab state instead meant guessing when to re-assert the badge
from `tabs.onUpdated` — which, without the `tabs` permission, hands over a `changeInfo`
with the interesting parts taken out, so a reloaded page came back multiplied with no badge
to say so. A page that came back unchanged reports nothing at all, so the worker is not
woken for every page load in every tab.

## Design

The popup uses the robinpoort.com palette, the same tokens and the same components as
[Unfurl](../unfurl/): the brand blue, tabs with a solid underline, buttons with a bottom
edge that sinks when pressed, chips for a single choice out of several, check-all switch
groups, and Barlow Semi Condensed for the small uppercase labels. Everything the reader
actually reads stays on the system font, so the popup still looks like part of Chrome.

On a page Chrome will not let an extension touch, the tabs and the panels go and the error
carries the popup on its own, with Chrome's own words underneath ours — the same as
Unfurl does with a page it cannot read.

Barlow is bundled as woff2 under `fonts/` and loaded from `font-src 'self'`. Nothing is
requested from Google Fonts or any other host at runtime, and the CSP in the manifest says
so: `connect-src 'none'`, `object-src 'none'`, `frame-src 'none'`, `base-uri 'none'`,
`form-action 'none'`.

## Languages

English and Dutch, through `_locales`. Chrome picks the browser's UI language and falls
back to English. The manifest name and description use `__MSG_...__`, so a Chrome Web
Store listing would be localised too.

Every string lives in `_locales/{en,nl}/messages.json` and is read through `t()` from
`i18n.js`, which falls back to the key itself, so a missing translation is visible
immediately instead of silently empty. Static strings in `popup.html` use `data-i18n`
attributes and are filled in on load. Factors are formatted with `Intl`, so a Dutch reader
gets `1,5×` and can type `1,35` into the field. Adding a language is one directory.

## Known limitations

- Does not work on `chrome://` pages, the Web Store or the PDF viewer. Chrome does not
  allow injection there.
- Multiplies what is in the DOM when you press Apply. Text the page adds afterwards —
  a menu that opens, a route that changes, a list that loads — is left alone until you
  apply again.
- Text set from CSS (`content:`) and text inside an iframe are untouched. Switch on
  **Highlight** and what stayed unmarked is exactly that.
