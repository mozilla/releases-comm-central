# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

FIREFOX_L10N = "https://github.com/mozilla-l10n/firefox-l10n"
THUNDERBIRD_L10N = "https://github.com/thunderbird/thunderbird-l10n"
COMM_L10N = "https://hg.mozilla.org/projects/comm-l10n"
COMM_L10N_PUSH = f"ssh{COMM_L10N[5:]}"
COMM_STRINGS_QUARANTINE = "https://hg.mozilla.org/projects/comm-strings-quarantine"
COMM_STRINGS_QUARANTINE_PUSH = f"ssh{COMM_STRINGS_QUARANTINE[5:]}"


GECKO_STRINGS_PATTERNS = (
    "{lang}/devtools/**",
    "{lang}/dom/**",
    "{lang}/extensions/spellcheck/**",
    "{lang}/netwerk/**",
    "{lang}/security/**",
    "{lang}/toolkit/**",
)

COMM_STRINGS_PATTERNS = (
    "{lang}/calendar/**",
    "{lang}/chat/**",
    "{lang}/mail/**",
)
