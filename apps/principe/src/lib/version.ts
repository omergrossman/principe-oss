// SPDX-License-Identifier: AGPL-3.0-or-later
// Single source of truth for the app version shown in the UI (launch splash +
// About page). Keep in sync with package.json "version" and the git release
// tag on each release — bump here and the splash + About update together.
export const APP_VERSION = "1.0.1";
export const RELEASE_URL = `https://github.com/omergrossman/principe-oss/releases/tag/v${APP_VERSION}`;
