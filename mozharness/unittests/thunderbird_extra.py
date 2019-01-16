#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at http://mozilla.org/MPL/2.0/.

#####
config = {
    "application": "thunderbird",
    "minimum_tests_zip_dirs": [
        "bin/*",
        "certs/*",
        "config/*",
        "extensions/*",
        "marionette/*",
        "modules/*",
        "mozbase/*",
        "tools/*",
    ],
    "all_mozmill_suites": {
        "mozmill": ["--list=tests/mozmill/mozmilltests.list"],
    },
    "all_mochitest_suites": {
        "browser-chrome-thunderbird": ["--flavor=browser",
                                       "--subsuite=thunderbird"],
    },
}
