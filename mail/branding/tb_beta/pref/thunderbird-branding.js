#include ../../include/release-prefs.js

// app.update.url.manual: URL user can browse to manually if for some reason
// all update installation attempts fail.
// app.update.url.details: a default value for the "More information about this
// update" link supplied in the "An update is available" page of the update
// wizard.
// beta channel
pref("app.update.url.manual", "https://www.thunderbird.net/%LOCALE%/download/beta/");
pref("app.update.url.details", "https://www.thunderbird.net/notes/beta/");
