# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/

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
    "mail.inappnotifications.enabled": False,
    # Do not check it is the default client at startup
    "mail.shell.checkDefaultClient": False,
}
