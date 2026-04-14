# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, you can obtain one at http://mozilla.org/MPL/2.0/.

from marionette_harness import MarionetteTestCase


class TestSystemIntegration(MarionetteTestCase):
    def setUp(self):
        MarionetteTestCase.setUp(self)
        self.marionette.set_context(self.marionette.CONTEXT_CHROME)
        # Some of these prefs are set in the thunderbirdinstance.py default
        # setup, so we need to make sure we have the correct values.
        self.marionette.enforce_gecko_prefs({
            "mail.account.account1.identities": "id1",
            "mail.account.account1.server": "server1",
            "mail.accountmanager.accounts": "account1",
            "mail.accountmanager.defaultaccount": "account1",
            "mail.identity.id1.fullName": "Marionette",
            "mail.identity.id1.useremail": "marionette@invalid",
            "mail.identity.id1.valid": True,
            "mail.server.server1.hostname": "localhost",
            "mail.server.server1.login_at_startup": False,
            "mail.server.server1.type": "pop3",
            "mail.spotlight.firstRunDone": True,
            "mail.winsearch.firstRunDone": True,
            "mail.provider.suppress_dialog_on_startup": False,
            "mail.shell.checkDefaultClient": True,
        })

    def test_system_ingration_startup_dialog(self):
        """
            Checks that the system integration dialog is shown on startup in a
            profile that has completed first run tasks but somehow isn't the
            default application. Of course this test can't work if the app this
            test is ran against is already the default client.
            We know this test runs late enough, since making the dialog modal
            won't even run this code until it is closed.
        """
        self.marionette.set_context(self.marionette.CONTEXT_CHROME)
        handles = self.marionette.chrome_window_handles
        self.assertEqual(2, len(handles), "Should have the main window and an additional window, hopefully the system integration dialog.")
        self.marionette.switch_to_window(handles[1], True)
        self.assertEqual("chrome://messenger/content/systemIntegrationDialog.xhtml", self.marionette.get_url())
        self.marionette.close_chrome_window()
        self.marionette.switch_to_window(handles[0], True)

    def tearDown(self):
        self.marionette.enforce_gecko_prefs({
            "mail.provider.suppress_dialog_on_startup": True,
            "mail.shell.checkDefaultClient": False,
        })
        MarionetteTestCase.tearDown(self)
