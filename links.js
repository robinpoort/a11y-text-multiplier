/**
 * Everything pointing at robinpoort.com lives here, so URLs are changed in one place.
 *
 * An empty path means "not published yet" and the popup then renders no link at all — so
 * it can never point at a 404. Page live? Fill in its path, reload, done.
 */

import { isDutch } from './i18n.js';

export const SITE = 'https://www.robinpoort.com';
export const REF = 'spill';

export const AUTHOR = {
  name: 'Robin Poort',
  path: { en: '/en/tools/spill/', nl: '/tools/spill/' },
};

const pick = (paths) => (paths ? (isDutch() ? paths.nl : paths.en) : '');
const withRef = (path) => (path ? `${SITE}${path}?ref=${REF}` : '');

export const authorUrl = () => withRef(pick(AUTHOR.path));
