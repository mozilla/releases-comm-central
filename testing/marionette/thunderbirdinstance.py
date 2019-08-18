# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/

# ALL CHANGES TO THIS FILE MUST HAVE REVIEW FROM A MARIONETTE PEER!
#
# The Marionette Python client is used out-of-tree with various builds of
# Firefox. Removing a preference from this file will cause regressions,
# so please be careful and get review from a Testing :: Marionette peer
# before you make any changes to this file.

from __future__ import absolute_import


thunderbird_prefs = {
    # Disable application updates
    "app.update.disabledForTesting": True,

    # Enable output of dump()
    "browser.dom.window.dump.enabled": True,

    # Do not show the EULA notification which can interfer with tests
    "browser.EULA.override": True,

    # Do not start first-run items
    "mail.provider.suppress_dialog_on_startup": True,
    "mail.spotlight.firstRunDone": True,
    "mail.winsearch.firstRunDone": True,

    # Do not open start page
    "mailnews.start_page.override_url": "about:blank",
    "mailnews.start_page.url": "about:blank",

    # Fix MacOS startup by disabling Mac address book integration.
    "ldap_2.servers.osx.description": "",
    "ldap_2.servers.osx.dirType": -1,
    "ldap_2.servers.osx.uri": "",
}
