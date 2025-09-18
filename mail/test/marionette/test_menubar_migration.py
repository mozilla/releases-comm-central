# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, you can obtain one at http://mozilla.org/MPL/2.0/.

import json
import os.path

from marionette_harness import MarionetteTestCase

here = os.path.dirname(__file__)


class TestMenubarMigration(MarionetteTestCase):
    get_autohide_attribute = """
        return document.getElementById("toolbar-menubar").getAttribute("autohide");
    """

    get_xulstore_value = """
        return Services.xulStore.getValue(
            "chrome://messenger/content/messenger.xhtml",
            "toolbar-menubar",
            "autohide"
        );
    """

    get_pref_value = """
        return Services.prefs.getIntPref("mail.ui-rdf.version", -1);
    """

    def test_no_xulstore(self):
        """
        A completely new profile. The menubar should be hidden, because that's the default.
        """
        self.subtest(None, None, "true", "")

    def test_no_xulstore_no_update(self):
        """
        The XUL store has no value and migration doesn't happen. The menubar should be hidden,
        because that's the default.
        """
        self.subtest(54, None, "true", "")

    def test_no_xulstore_update(self):
        """
        The XUL store has no value when migration happens. The menubar should be visible, because
        that's what no value in the XUL store meant before ESR 140.
        """
        self.subtest(46, None, None, "-moz-missing\n")

    def test_xulstore_false_no_update(self):
        """
        The XUL store value is false and migration doesn't happen. The menubar should be visible.
        """
        self.subtest(54, "false", None, "-moz-missing\n")

    def test_xulstore_false_update(self):
        """
        The XUL store value is false when migration happens. The menubar should be visible.
        """
        self.subtest(46, "false", None, "-moz-missing\n")

    def test_xulstore_missing_no_update(self):
        """
        The XUL store value is -moz-missing\n and migration doesn't happen. The menubar should be visible.
        """
        self.subtest(54, "-moz-missing\n", None, "-moz-missing\n")

    def test_xulstore_missing_update(self):
        """
        The XUL store value is -moz-missing\n when migration happens. The menubar should be visible.
        """
        self.subtest(52, "-moz-missing\n", None, "-moz-missing\n")

    def test_xulstore_true_no_update(self):
        """
        The XUL store value is true and migration doesn't happen. The menubar should be hidden.
        """
        self.subtest(52, "true", "true", "true")

    def test_xulstore_true_update(self):
        """
        The XUL store value is true when migration happens. The menubar should be hidden.
        """
        self.subtest(46, "true", "true", "true")

    def subtest(
        self, migration_version, xulstore_value, expected_attribute_value, expected_xulstore_value
    ):
        self.marionette.set_context(self.marionette.CONTEXT_CHROME)
        self.marionette.quit(in_app=True)

        # Set the migration pref to a number higher than the migration we're testing
        prefs_path = os.path.join(self.marionette.profile_path, "prefs.js")
        if migration_version is None:
            os.unlink(prefs_path)
        else:
            with open(prefs_path, "w") as prefs_file:
                prefs_file.write(f"""user_pref("mail.ui-rdf.version", {migration_version});\n""")

        # Write a xulstore.json file that has the attribute set to true.
        xulstore_path = os.path.join(self.marionette.profile_path, "xulstore.json")
        if migration_version is None:
            os.unlink(xulstore_path)
        else:
            if xulstore_value is None:
                xulstore_data = {"chrome://messenger/content/messenger.xhtml": {}}
            else:
                xulstore_data = {
                    "chrome://messenger/content/messenger.xhtml": {
                        "toolbar-menubar": {"autohide": xulstore_value}
                    }
                }
            with open(xulstore_path, "w") as xulstore_file:
                json.dump(xulstore_data, xulstore_file)

        # Start the application, check the state.
        self.marionette.start_session()
        self.marionette.set_context(self.marionette.CONTEXT_CHROME)
        self.assertEqual(
            expected_attribute_value, self.marionette.execute_script(self.get_autohide_attribute)
        )
        self.assertEqual(
            expected_xulstore_value, self.marionette.execute_script(self.get_xulstore_value)
        )
        self.assertTrue(self.marionette.execute_script(self.get_pref_value) > 47)
