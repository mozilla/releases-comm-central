# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# For these tests, we need to disable the account provisioner, or
# else it will spawn immediately and block before we have a chance to run
# any Mozmill tests.

# We don't want any accounts for these tests.
NO_ACCOUNTS = True
# Do not force enable main menu bar (keep the default).
DEFAULT_MENUBAR = True

PREFS = {
    "mail.provider.enabled": False,
}
