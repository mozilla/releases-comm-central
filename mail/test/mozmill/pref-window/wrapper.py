# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# For test-font-chooser.js we need a few default prefs -- this module does that.

import sys

# Default preferences used for test-font-chooser.js. The UUIDs here
# should be kept in sync with kFakeFonts in test-font-chooser.js.

if sys.platform == "win32":
    PREFS = {
        "font.name-list.serif.x-western": "bc7e8c62-0634-467f-a029-fe6abcdf1582, Times New Roman",
        "font.name-list.sans-serif.x-western": "419129aa-43b7-40c4-b554-83d99b504b89, Arial",
        "font.name-list.monospace.x-western": "348df6e5-e874-4d21-ad4b-359b530a33b7, Courier New",
    }

elif sys.platform == "darwin":
    PREFS = {
        "font.name-list.serif.x-western": "bc7e8c62-0634-467f-a029-fe6abcdf1582, Times",
        "font.name-list.sans-serif.x-western": "419129aa-43b7-40c4-b554-83d99b504b89, Helvetica",
        "font.name-list.monospace.x-western": "348df6e5-e874-4d21-ad4b-359b530a33b7, Courier",
    }

else:
    # Fallback to Linux prefs -- we're assuming that they're other unixes.
    PREFS = {
        "font.name-list.serif.x-western": "bc7e8c62-0634-467f-a029-fe6abcdf1582, serif",
        "font.name-list.sans-serif.x-western": "419129aa-43b7-40c4-b554-83d99b504b89, sans-serif",
        "font.name-list.monospace.x-western": "348df6e5-e874-4d21-ad4b-359b530a33b7, monospace",
    }
