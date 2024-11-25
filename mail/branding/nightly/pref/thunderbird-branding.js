/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Default start page
pref("mailnews.start_page.url", "https://live.thunderbird.net/%APP%/start?locale=%LOCALE%&version=%VERSION%&channel=%CHANNEL%&os=%OS%&buildid=%APPBUILDID%");

// start page override to load after an update
// pref("mailnews.start_page.override_url", "https://live.thunderbird.net/%APP%/whatsnew?locale=%LOCALE%&version=%VERSION%&channel=%CHANNEL%&os=%OS%&buildid=%APPBUILDID%&oldversion=%OLD_VERSION%");
// Leave blank per bug 1695529 until the website has a proper "Thunderbird Daily" landing page
pref("mailnews.start_page.override_url", "");

// There's no Thunderbird Daily specific page or release notes
// URL user can browse to manually if for some reason all update installation
// attempts fail.
pref("app.update.url.manual", "https://www.thunderbird.net/");
// A default value for the "More information about this update" link
// supplied in the "An update is available" page of the update wizard.
pref("app.update.url.details", "https://www.thunderbird.net/");

// Interval: Time between checks for a new version (in seconds)
// nightly=1 hour, official=24 hours
pref("app.update.interval", 3600);

// Give the user x seconds to react before showing the big UI. nightly=1 hour
pref("app.update.promptWaitTime", 3600);

// The number of days a binary is permitted to be old
// without checking for an update.  This assumes that
// app.update.checkInstallTime is true.
pref("app.update.checkInstallTime.days", 2);

// Give the user x seconds to reboot before showing a badge on the hamburger
// button. default=immediately
pref("app.update.badgeWaitTime", 0);

pref("app.vendorURL", "https://www.thunderbird.net/%LOCALE%/");

// In-app notification server endpoint
pref("mail.inappnotifications.url", "https://notifications-stage.thunderbird.net/notifications.json");
