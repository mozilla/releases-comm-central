# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, you can obtain one at http://mozilla.org/MPL/2.0/.

import json
import os.path

from marionette_harness import MarionetteTestCase

here = os.path.dirname(__file__)

with open(os.path.join(here, "scripts", "tabs.js")) as script:
    get_tabs = script.read()
mail_3pane_tab = {"mode": "mail3PaneTab"}
close_tabs = """
    const tabmail = document.getElementById("tabmail");
    tabmail.closeOtherTabs(0);
"""


class TestSessionStore(MarionetteTestCase):
    def check_json_file(self, expected):
        """Checks the session store JSON file has the right info."""
        json_path = os.path.join(self.marionette.profile_path, "session.json")
        with open(json_path, "r") as json_file:
            actual = json.load(json_file)

        def assert_similar(actual_value, expected_value):
            """Checks that `actual_value` matches `expected_value` by type and content."""
            if isinstance(expected_value, list):
                # This is a strict check: the items in `expected_value` must be in `actual_value`,
                # and in the same order.
                self.assertIsInstance(actual_value, list)
                self.assertEqual(len(actual_value), len(expected_value))
                for i in range(0, len(expected_value)):
                    assert_similar(actual_value[i], expected_value[i])
                return

            if isinstance(expected_value, dict):
                # This is a lenient check: if a key isn't in `expected_value`, it isn't checked.
                self.assertIsInstance(actual_value, dict)
                for k in expected_value.keys():
                    assert_similar(actual_value[k], expected_value[k])
                return

            self.assertEqual(actual_value, expected_value)

        assert_similar(actual["windows"][0], expected[0])

    def test_only_3pane_tab(self):
        self.marionette.set_context(self.marionette.CONTEXT_CHROME)
        self.assertEqual("mail:3pane", self.marionette.get_window_type())
        self.marionette.execute_script(
            """
            MailServices.accounts.createLocalMailAccount();
            """
        )
        self.marionette.quit(in_app=True)

        self.check_json_file(
            [
                {
                    "type": "3pane",
                    "tabs": {
                        "tabs": [
                            {
                                "mode": "mail3PaneTab",
                                "state": {
                                    "firstTab": True,
                                    "folderPaneVisible": True,
                                    "folderURI": "mailbox://nobody@Local%20Folders",
                                    "messagePaneVisible": True,
                                },
                            }
                        ]
                    },
                }
            ]
        )

        self.marionette.start_session()
        self.marionette.set_context(self.marionette.CONTEXT_CHROME)
        self.assertEqual("mail:3pane", self.marionette.get_window_type())
        tabs = self.marionette.execute_async_script(get_tabs)
        self.assertEqual([mail_3pane_tab], tabs)
        self.marionette.execute_script(
            """
            MailServices.accounts.removeAccount(MailServices.accounts.accounts[0], false);
            """
        )

    def subtest_simple_tab(self, opener, expected_session_data, expected_tab):
        self.marionette.set_context(self.marionette.CONTEXT_CHROME)
        self.marionette.execute_script(opener)
        self.marionette.quit(in_app=True)

        self.check_json_file([{"type": "3pane", "tabs": {"tabs": [expected_session_data]}}])

        self.marionette.start_session()
        self.marionette.set_context(self.marionette.CONTEXT_CHROME)
        self.assertEqual("mail:3pane", self.marionette.get_window_type())
        tabs = self.marionette.execute_async_script(get_tabs)
        self.assertEqual(
            [mail_3pane_tab, expected_tab],
            tabs,
        )
        self.marionette.execute_script(close_tabs)

    def test_addressbook_tab(self):
        self.subtest_simple_tab(
            'openTab("addressBookTab");',
            {"mode": "addressBookTab"},
            {"mode": "addressBookTab", "url": "about:addressbook"},
        )

    def test_calendar_tab(self):
        self.subtest_simple_tab('openTab("calendar");', {"mode": "calendar"}, {"mode": "calendar"})

    def test_tasks_tab(self):
        self.subtest_simple_tab('openTab("tasks");', {"mode": "tasks"}, {"mode": "tasks"})

    def test_chat_tab(self):
        self.subtest_simple_tab('openTab("chat");', {"mode": "chat"}, {"mode": "chat"})

    def test_content_tab(self):
        self.subtest_simple_tab(
            'openContentTab("about:mozilla");',
            {
                "mode": "contentTab",
                "state": {
                    "tabURI": "about:mozilla",
                    "linkHandler": "single-site",
                    "userContextId": "0",
                },
            },
            {
                "mode": "contentTab",
                "url": "about:mozilla",
                "linkHandler": "single-site",
                "userContextId": "0",
            },
        )
