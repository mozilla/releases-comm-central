# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# For test-instrumentation.js, we need to disable the account provisioner, or
# else it will spawn immediately and block before we have a chance to run
# any Mozmill tests.

import os
import shutil

# We don't want any accounts for these tests.
NO_ACCOUNTS = True


def on_profile_created(profiledir):
    """
    On profile creation, this copies *-prefs.js from the current folder to
    profile_dir as a user.js file. These user prefs is interpreted in addition
    to the standard prefs.js file.
    """
    # The pref file is in the same directory this script is in.
    preffile = os.path.join(os.path.dirname(__file__), "prefs.js")
    shutil.copy(preffile, os.path.join(profiledir, "user.js"))
