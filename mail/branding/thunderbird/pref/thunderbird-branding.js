// Default start page
pref("mailnews.start_page.url", "https://live.thunderbird.net/%APP%/start?locale=%LOCALE%&version=%VERSION%&channel=%CHANNEL%&os=%OS%&buildid=%APPBUILDID%");

// Start page override to load after an update. Balrog will set an appropriate
// url for this, see whats_new_page.yml
pref("mailnews.start_page.override_url", "");

// app.update.url.manual: URL user can browse to manually if for some reason
// all update installation attempts fail.
// app.update.url.details: a default value for the "More information about this
// update" link supplied in the "An update is available" page of the update
// wizard.
#if MOZ_UPDATE_CHANNEL == beta
  pref("app.update.url.manual", "https://www.thunderbird.net/%LOCALE%/download/beta/");
  pref("app.update.url.details", "https://www.thunderbird.net/notes/beta/");
#else
  // release channel
  pref("app.update.url.manual", "https://www.thunderbird.net/");
  pref("app.update.url.details", "https://www.thunderbird.net/notes/");
#endif

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

pref("app.vendorURL", "https://www.thunderbird.net/%LOCALE%/");

pref("browser.search.param.ms-pc", "MOZT");
