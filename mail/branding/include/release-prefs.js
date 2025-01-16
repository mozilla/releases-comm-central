// Default start page
pref("mailnews.start_page.url", "https://live.thunderbird.net/%APP%/start?locale=%LOCALE%&version=%VERSION%&channel=%CHANNEL%&os=%OS%&buildid=%APPBUILDID%");

// Start page override to load after an update. Balrog will set an appropriate
// url for this, see whats_new_page.yml
pref("mailnews.start_page.override_url", "");

// Interval: Time between checks for a new version (in seconds)
// nightly=8 hours, official=24 hours
pref("app.update.interval", 86400);

// Give the user x seconds to react before showing the big UI. default=24 hours
pref("app.update.promptWaitTime", 86400);

// The number of days a binary is permitted to be old
// without checking for an update.  This assumes that
// app.update.checkInstallTime is true.
pref("app.update.checkInstallTime.days", 63);

// Give the user x seconds to reboot before showing a badge on the hamburger
// button. default=4 days
pref("app.update.badgeWaitTime", 345600);
// This represents the duration between an update being ready and it being
// possible to install it while other sessions are running. Note that
// having this pref's duration differ from `app.update.badgeWaitTime` may result
// in undefined behavior such as showing an update prompt that does not result
// in an update when the "Restart to Update" button is clicked. Keep in mind
// that this is in milliseconds and `app.update.badgeWaitTime` is in seconds.
// Note that the effective value of this pref is limited to 1 week, maximum.
pref("app.update.multiSessionInstallLockout.timeoutMs", 345600000);

pref("app.vendorURL", "https://www.thunderbird.net/%LOCALE%/");

pref("browser.search.param.ms-pc", "MOZT");

// In-app notification server endpoint
pref("mail.inappnotifications.url", "https://notifications.thunderbird.net/notifications.json");
