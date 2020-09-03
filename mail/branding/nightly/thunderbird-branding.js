/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Default start page
pref("mailnews.start_page.url", "https://live.thunderbird.net/%APP%/start?locale=%LOCALE%&version=%VERSION%&channel=%CHANNEL%&os=%OS%&buildid=%APPBUILDID%");

// start page override to load after an update
pref("mailnews.start_page.override_url", "https://live.thunderbird.net/%APP%/whatsnew?locale=%LOCALE%&version=%VERSION%&channel=%CHANNEL%&os=%OS%&buildid=%APPBUILDID%&oldversion=%OLD_VERSION%");

// Interval: Time between checks for a new version (in seconds)
// nightly=1 hour, official=24 hours
pref("app.update.interval", 3600);

// Give the user x seconds to react before showing the big UI. nightly=1 hour
pref("app.update.promptWaitTime", 3600);

pref("app.vendorURL", "https://www.thunderbird.net/%LOCALE%/");
