# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, you can obtain one at http://mozilla.org/MPL/2.0/.

import os.path

from marionette_harness import MarionetteTestCase

here = os.path.dirname(__file__)

with open(os.path.join(here, "scripts", "get_tabs.js")) as script:
    get_tabs = script.read()
mail_3pane_tab = {"mode": "mail3PaneTab"}
close_tabs = """
    const tabmail = document.getElementById("tabmail");
    tabmail.closeOtherTabs(0);
"""


class TestCommandLine(MarionetteTestCase):
    def test_addressbook(self):
        """Opens the address book in a tab."""
        self.subtest_open_tab(
            ["--addressbook"],
            [mail_3pane_tab, {"mode": "addressBookTab", "url": "about:addressbook"}],
        )

    def test_import_vcf_file(self):
        """
        Opens the address book in a tab and starts a new contact with the imported file's data.
        TODO: Check that the address book is in editing mode with the card's details.
        """
        self.subtest_open_tab(
            [os.path.join(here, "data", "import.vcf")],
            [mail_3pane_tab, {"mode": "addressBookTab", "url": "about:addressbook"}],
        )

    def test_calendar(self):
        """Opens the calendar in a tab."""
        self.subtest_open_tab(["--calendar"], [mail_3pane_tab, {"mode": "calendar"}])

    def test_import_ics_file(self):
        """
        Opens the import tab with the imported file's data.
        TODO: Check that the import tab has the file's data.
        """
        self.subtest_open_tab(
            [os.path.join(here, "data", "import.ics")],
            [
                mail_3pane_tab,
                {
                    "mode": "contentTab",
                    "url": "about:import#calendar",
                    "linkHandler": "single-site",
                },
            ],
        )

    def test_mail(self):
        """Opens to the 3-pane tab."""
        self.subtest_open_tab(["--mail"], [mail_3pane_tab])

    def test_migration(self):
        """
        Opens the import tab. We really only keep this behaviour because --migration is listed in
        the help text.
        """
        self.subtest_open_tab(
            ["--migration"],
            [
                mail_3pane_tab,
                {
                    "mode": "contentTab",
                    "url": "about:import#start",
                    "linkHandler": "single-site",
                },
            ],
        )

    def test_preferences(self):
        """Opens the preferences tab."""
        self.subtest_open_tab(
            ["--options"],
            [mail_3pane_tab, {"mode": "preferencesTab", "url": "about:preferences"}],
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
            [mail_3pane_tab],
        )

    def subtest_open_tab(self, app_args=[], expected_tabs=[]):
        self.marionette.set_context(self.marionette.CONTEXT_CHROME)
        self.marionette.quit(in_app=True)

        self.marionette.instance.app_args = app_args
        self.marionette.start_session()
        self.marionette.set_context(self.marionette.CONTEXT_CHROME)
        self.assertEqual("mail:3pane", self.marionette.get_window_type())

        tabs = self.marionette.execute_async_script(get_tabs)
        self.assertEqual(expected_tabs, tabs)

        self.marionette.execute_script(close_tabs)
        self.marionette.instance.app_args = []

    def test_thunderbird_url(self):
        self.marionette.set_context(self.marionette.CONTEXT_CHROME)
        self.marionette.quit(in_app=True)

        # Open Thunderbird, passing a net.thunderbird URL.
        self.marionette.instance.app_args = ["net.thunderbird://replay/hello"]
        self.marionette.start_session()
        self.marionette.set_context(self.marionette.CONTEXT_CHROME)
        self.assertEqual("mail:3pane", self.marionette.get_window_type())

        # Check that the URL reached the handler.
        echo_url = """
            const service = Cc["@mozilla.org/test/thunderbird-url-replay;1"].getService(Ci.nsIObserver);
            const container = Cc["@mozilla.org/supports-string;1"].createInstance(Ci.nsISupportsString);
            container.data = "REPLACE ME";
            service.observe(container, "replay", "");
            return container.data;
        """
        replay = self.marionette.execute_script(echo_url)
        # If the value is "REPLACE ME", the script above failed somehow.
        # If it is "NOT SET", the URL did not reach the handler.
        self.assertEqual("net.thunderbird://replay/hello", replay)

        self.marionette.instance.app_args = []

    def test_zzz(self):
        """
        Quits and restarts Thunderbird one more time to workaround code
        coverage data not being recorded properly.
        """
        self.subtest_open_tab([], [mail_3pane_tab])
