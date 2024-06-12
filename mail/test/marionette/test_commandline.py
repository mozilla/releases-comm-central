# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, you can obtain one at http://mozilla.org/MPL/2.0/.

import os
import os.path

from marionette_harness import MarionetteTestCase


class TestCommandLine(MarionetteTestCase):
    get_tabs = """
        const [resolve] = arguments;
        const tabmail = document.getElementById("tabmail");
        const loadPromises = [];

        for (const tab of tabmail.tabInfo) {
            if (tab.mode.name != "contentTab") {
                continue;
            }
            if (tab.browser.isLoadingDocument) {
                loadPromises.push(new Promise(function (resolve) {
                    tab.browser.addEventListener("load", resolve, { once: true, capture: true });
                }));
            }
        }

        Promise.all(loadPromises).then(() => {
            resolve(tabmail.tabInfo.map(t => {
                return {
                    mode: t.mode.name,
                    url: t.browser?.currentURI?.spec,
                };
            }));
        });
    """
    close_tabs = """
        const tabmail = document.getElementById("tabmail");
        tabmail.closeOtherTabs(0);
    """
    mail_3pane_tab = {"mode": "mail3PaneTab", "url": None}

    def test_addressbook(self):
        """Opens the address book in a tab."""
        self.subtest_open_tab(
            ["--addressbook"],
            [
                self.mail_3pane_tab,
                {"mode": "addressBookTab", "url": "about:addressbook"},
            ],
        )

    def test_import_vcf_file(self):
        """
        Opens the address book in a tab and starts a new contact with the imported file's data.
        TODO: Check that the address book is in editing mode with the card's details.
        """
        self.subtest_open_tab(
            [os.path.join(os.path.dirname(__file__), "data", "import.vcf")],
            [
                self.mail_3pane_tab,
                {"mode": "addressBookTab", "url": "about:addressbook"},
            ],
        )

    def test_calendar(self):
        """Opens the calendar in a tab."""
        self.subtest_open_tab(
            ["--calendar"],
            [
                self.mail_3pane_tab,
                {"mode": "calendar", "url": None},
            ],
        )

    def test_import_ics_file(self):
        """
        Opens the import tab with the imported file's data.
        TODO: Check that the import tab has the file's data.
        """
        self.subtest_open_tab(
            [os.path.join(os.path.dirname(__file__), "data", "import.ics")],
            [
                self.mail_3pane_tab,
                {"mode": "contentTab", "url": "about:import#calendar"},
            ],
        )

    def test_mail(self):
        """Opens to the 3-pane tab."""
        self.subtest_open_tab(
            ["--mail"],
            [self.mail_3pane_tab],
        )

    def test_migration(self):
        """
        Opens the import tab. We really only keep this behaviour because --migration is listed in
        the help text.
        """
        self.subtest_open_tab(
            ["--migration"],
            [self.mail_3pane_tab, {"mode": "contentTab", "url": "about:import#start"}],
        )

    def test_preferences(self):
        """Opens the preferences tab."""
        self.subtest_open_tab(
            ["--options"],
            [
                self.mail_3pane_tab,
                {"mode": "preferencesTab", "url": "about:preferences"},
            ],
        )

    def test_windows_notification(self):
        """
        Tests what happens if a Windows notification is clicked on while Thunderbird is closed.
        This shouldn't happen as all notifications are removed on close, but we'll check that we
        at least get a window opening and not a crash.
        (Yes, we can run this test on all platforms, the expected behaviour is the same.)
        """
        self.subtest_open_tab(
            [
                "--notification-windowsTag",
                "1244827611",
                "--notification-windowsAction",
                '{"action":""}',
            ],
            [self.mail_3pane_tab],
        )

    def subtest_open_tab(self, app_args=[], expected_tabs=[]):
        self.marionette.set_context(self.marionette.CONTEXT_CHROME)
        self.marionette.quit(in_app=True)

        self.marionette.instance.app_args = app_args
        self.marionette.start_session()
        self.marionette.set_context(self.marionette.CONTEXT_CHROME)
        self.assertEqual("mail:3pane", self.marionette.get_window_type())

        tabs = self.marionette.execute_async_script(self.get_tabs)
        self.assertEqual(expected_tabs, tabs)

        self.marionette.execute_script(self.close_tabs)
        self.marionette.instance.app_args = []

    get_compose_details = """
        const [resolve] = arguments;

        function finish() {
            function getRecipients(field) {
                return Array.from(
                    document.querySelectorAll(`#${field} mail-address-pill`),
                    pill => pill.label
                );
            }
            resolve({
                to: getRecipients("addressRowTo"),
                cc: getRecipients("addressRowCc"),
                bcc: getRecipients("addressRowBcc"),
                subject: document.getElementById("msgSubject").value,
            });
        }

        if (window.composeEditorReady) {
            finish();
        } else {
            window.addEventListener("compose-editor-ready", finish, { once: true });
        }
    """

    def test_compose(self):
        """
        Opens the main window and a compose window with the compose fields from the command-line.
        Note that there's a different code path for this if you include the `--compose` flag.
        That can't currently be tested because it only opens the compose window.
        """

        # Just enough preferences to allow composing a message.
        self.marionette.set_context(self.marionette.CONTEXT_CHROME)
        self.marionette.set_prefs(
            {
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
            }
        )
        self.marionette.quit(in_app=True)

        self.marionette.instance.app_args = [
            "mailto:test@invalid?cc=everybody@invalid&subject=I'm having a party!"
        ]
        self.marionette.start_session()

        handles = self.marionette.chrome_window_handles
        self.assertEqual(2, len(handles))

        self.marionette.set_context(self.marionette.CONTEXT_CHROME)
        self.assertEqual("mail:3pane", self.marionette.get_window_type())
        tabs = self.marionette.execute_async_script(self.get_tabs)
        self.assertEqual([self.mail_3pane_tab], tabs)

        self.marionette.switch_to_window(handles[1], True)
        self.assertEqual("msgcompose", self.marionette.get_window_type())

        compose_details = self.marionette.execute_async_script(self.get_compose_details)
        self.assertEqual(
            {
                "to": ["test@invalid"],
                "cc": ["everybody@invalid"],
                "bcc": [],
                "subject": "I'm having a party!",
            },
            compose_details,
        )

        self.marionette.clear_pref("mail.account.account1.identities")
        self.marionette.clear_pref("mail.account.account1.server")
        self.marionette.clear_pref("mail.accountmanager.accounts")
        self.marionette.clear_pref("mail.accountmanager.defaultaccount")
        self.marionette.clear_pref("mail.identity.id1.fullName")
        self.marionette.clear_pref("mail.identity.id1.useremail")
        self.marionette.clear_pref("mail.identity.id1.valid")
        self.marionette.clear_pref("mail.server.server1.hostname")
        self.marionette.clear_pref("mail.server.server1.login_at_startup")
        self.marionette.clear_pref("mail.server.server1.type")
        self.marionette.close_chrome_window()
        self.marionette.instance.app_args = []
