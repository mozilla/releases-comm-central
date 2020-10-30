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
    # Do not check it is the default client at startup
    "mail.shell.checkDefaultClient": False,
    # Set up a dummy account to unlock various actions
    "mail.root.none-rel": "[ProfD]Mail",
    "mail.root.pop3-rel": "[ProfD]Mail",
    "mail.account.account1.server": "server1",
    "mail.account.account2.identities": "id1,id2",
    "mail.account.account2.server": "server2",
    "mail.account.account3.server": "server3",
    "mail.accountmanager.accounts": "account1,account2,account3",
    "mail.accountmanager.defaultaccount": "account2",
    "mail.accountmanager.localfoldersserver": "server1",
    "mail.identity.id1.fullName": "Tinderbox",
    "mail.identity.id1.htmlSigFormat": False,
    "mail.identity.id1.htmlSigText": "Tinderbox is soo 90ies",
    "mail.identity.id1.smtpServer": "smtp1",
    "mail.identity.id1.useremail": "tinderbox@foo.invalid",
    "mail.identity.id1.valid": True,
    "mail.identity.id2.fullName": "Tinderboxpushlog",
    "mail.identity.id2.htmlSigFormat": True,
    "mail.identity.id2.htmlSigText": "Tinderboxpushlog is the new <b>hotness!</b>",
    "mail.identity.id2.smtpServer": "smtp1",
    "mail.identity.id2.useremail": "tinderboxpushlog@foo.invalid",
    "mail.identity.id2.valid": True,
    "mail.server.server1.directory-rel": "[ProfD]Mail/Local Folders",
    "mail.server.server1.hostname": "Local Folders",
    "mail.server.server1.name": "Local Folders",
    "mail.server.server1.type": "none",
    "mail.server.server1.userName": "nobody",
    "mail.server.server2.check_new_mail": False,
    "mail.server.server2.directory-rel": "[ProfD]Mail/tinderbox",
    "mail.server.server2.download_on_biff": True,
    "mail.server.server2.hostname": "tinderbox123",
    "mail.server.server2.login_at_startup": False,
    "mail.server.server2.name": "tinderbox@foo.invalid",
    "mail.server.server2.type": "pop3",
    "mail.server.server2.userName": "tinderbox",
    "mail.server.server2.whiteListAbURI": "",
    "mail.server.server3.hostname": "prpl-irc",
    "mail.server.server3.imAccount": "account1",
    "mail.server.server3.type": "im",
    "mail.server.server3.userName": "mozmilltest@irc.mozilla.invalid",
    "mail.smtp.defaultserver": "smtp1",
    "mail.smtpserver.smtp1.hostname": "tinderbox123",
    "mail.smtpserver.smtp1.username": "tinderbox",
    "mail.smtpservers": "smtp1",
    "messenger.account.account1.autoLogin": False,
    "messenger.account.account1.firstConnectionState": 1,
    "messenger.account.account1.name": "mozmilltest@irc.mozilla.invalid",
    "messenger.account.account1.prpl": "prpl-irc",
    "messenger.accounts": "account1",
}
