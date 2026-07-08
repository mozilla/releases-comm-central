# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, you can obtain one at http://mozilla.org/MPL/2.0/.

import os.path
import tempfile

from marionette_harness import MarionetteTestCase

here = os.path.dirname(__file__)

with open(os.path.join(here, "scripts", "get_tabs.js")) as script:
    get_tabs = script.read()
with open(os.path.join(here, "scripts", "get_compose_details.js")) as script:
    get_compose_details = script.read()
with open(os.path.join(here, "scripts", "get_attachment_info.js")) as script:
    get_attachment_info = script.read()
mail_3pane_tab = {"mode": "mail3PaneTab"}


class TestComposeCommandLine(MarionetteTestCase):
    # Shared account prefs needed for compose tests.
    _COMPOSE_PREFS = {
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
    _COMPOSE_PREF_KEYS = list(_COMPOSE_PREFS.keys())

    def _setup_compose_prefs(self):
        """Set up account preferences and restart for a compose test."""
        self.marionette.set_context(self.marionette.CONTEXT_CHROME)
        self.marionette.set_prefs(self._COMPOSE_PREFS)
        self.marionette.quit(in_app=True)

    def _teardown_compose_prefs(self):
        """Clean up account preferences and quit the session."""
        for key in self._COMPOSE_PREF_KEYS:
            self.marionette.clear_pref(key)
        self.marionette.instance.app_args = []
        self.marionette.quit(in_app=True)

    def _assert_attachments(self, temp_paths, attachment_items):
        """Assert attachment names and URL format match the given paths."""
        self.assertEqual(len(temp_paths), len(attachment_items))
        for temp_path, item in zip(temp_paths, attachment_items):
            self.assertEqual(os.path.basename(temp_path), item["name"])
            url = item["url"]
            self.assertTrue(url.startswith("file:///"))
            self.assertNotIn("\\", url, "URL should not contain backslashes")
            # The URL should end with the filename (comma may or may not be
            # percent-encoded, both forms are valid in file URIs).
            filename = os.path.basename(temp_path)
            self.assertTrue(
                url.endswith(filename) or url.endswith(filename.replace(",", "%2C")),
            )

    def test_compose(self):
        """
        Opens the main window and a compose window with the compose fields from the
        command-line (uses the mailto: code path).
        """

        self._setup_compose_prefs()

        self.marionette.instance.app_args = [
            "mailto:test@invalid?cc=everybody@invalid&subject=I'm having a party!"
        ]
        self.marionette.start_session()

        handles = self.marionette.chrome_window_handles
        self.assertEqual(2, len(handles))

        self.marionette.set_context(self.marionette.CONTEXT_CHROME)
        self.assertEqual("mail:3pane", self.marionette.get_window_type())
        tabs = self.marionette.execute_async_script(get_tabs)
        self.assertEqual([mail_3pane_tab], tabs)

        self.marionette.switch_to_window(handles[1], True)
        self.assertEqual("msgcompose", self.marionette.get_window_type())

        compose_details = self.marionette.execute_async_script(
            get_compose_details
        )
        self.assertEqual(
            {
                "to": ["test@invalid"],
                "cc": ["everybody@invalid"],
                "bcc": [],
                "subject": "I'm having a party!",
            },
            compose_details,
        )

        self._teardown_compose_prefs()

    def test_compose_attachment(self):
        """
        Opens a compose window with a file attachment from the --compose command line.
        Uses a filename containing a comma to verify comma-in-URI handling (bug 900117)
        and verifies the URL is a well-formed file:/// URI (bug 2051476).
        """

        # Create a temp file with a comma in the name (exercises comma-in-URI fix).
        tmpdir = tempfile.mkdtemp()
        temp_path = os.path.join(tmpdir, "tb-attach,test.txt")
        with open(temp_path, "wb") as f:
            f.write(b"test content")

        try:
            self._setup_compose_prefs()

            self.marionette.instance.app_args = [
                "--compose",
                f"attachment='file://{temp_path}'",
            ]
            self.marionette.start_session()

            handles = self.marionette.chrome_window_handles
            self.assertEqual(2, len(handles))

            self.marionette.set_context(self.marionette.CONTEXT_CHROME)
            self.assertEqual("mail:3pane", self.marionette.get_window_type())

            self.marionette.switch_to_window(handles[1], True)
            self.assertEqual("msgcompose", self.marionette.get_window_type())

            items = self.marionette.execute_async_script(get_attachment_info)
            self._assert_attachments([temp_path], items)

            self._teardown_compose_prefs()
        finally:
            os.unlink(temp_path)
            os.rmdir(tmpdir)

    def test_compose_attachment_multiple(self):
        """
        Opens a compose window with multiple comma-separated file URIs from the
        --compose command line. Verifies each attachment has the correct filename
        and a well-formed URL.
        """

        # Create two temporary files to attach.
        temp_paths = []
        for suffix in ("-first.txt", "-second.txt"):
            with tempfile.NamedTemporaryFile(
                prefix="tb-attach", suffix=suffix, delete=False
            ) as f:
                f.write(b"test content")
                temp_paths.append(f.name)

        try:
            self._setup_compose_prefs()

            attachment_arg = ",".join(f"file://{p}" for p in temp_paths)
            self.marionette.instance.app_args = [
                "--compose",
                f"attachment='{attachment_arg}'",
            ]
            self.marionette.start_session()

            handles = self.marionette.chrome_window_handles
            self.assertEqual(2, len(handles))

            self.marionette.set_context(self.marionette.CONTEXT_CHROME)
            self.assertEqual("mail:3pane", self.marionette.get_window_type())

            self.marionette.switch_to_window(handles[1], True)
            self.assertEqual("msgcompose", self.marionette.get_window_type())

            items = self.marionette.execute_async_script(get_attachment_info)
            self._assert_attachments(temp_paths, items)

            self._teardown_compose_prefs()
        finally:
            for p in temp_paths:
                os.unlink(p)
