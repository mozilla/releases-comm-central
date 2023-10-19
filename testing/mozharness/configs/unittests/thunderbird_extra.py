#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at http://mozilla.org/MPL/2.0/.

#####
config = {
    "application": "thunderbird",
    "appdir": "dist/bin/",
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
    "all_gtest_suites": {
        "gtest": {"env": {"GTEST_FILTER": "TestMail*:TestMsg*"}},
    },
    "all_mochitest_suites": {
        "mochitest-browser-chrome-thunderbird": [
            "--flavor=browser",
            "--subsuite=thunderbird",
            "--leak-threshold=51200",  # 50kB
        ],
    },
}
