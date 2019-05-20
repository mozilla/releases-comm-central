# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# For these tests, we need to disable the account provisioner, or
# else it will spawn immediately and block before we have a chance to run
# any Mozmill tests.

import os
import shutil

# We don't want any accounts for these tests.
NO_ACCOUNTS = True
# Do not force enable main menu bar, we'll set our own value in prefs.js.
DEFAULT_MENUBAR = True

PREFS = {
    "mail.provider.enabled": False,
    "mail.main_menu.collapse_by_default": False,
}
