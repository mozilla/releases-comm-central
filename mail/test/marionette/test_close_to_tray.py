# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, you can obtain one at http://mozilla.org/MPL/2.0/.

from marionette_driver import Wait
from marionette_driver.keys import Keys
from marionette_harness import MarionetteTestCase


class TestCloseToTray(MarionetteTestCase):
    def setUp(self):
        super().setUp()

        self.marionette.set_context(self.marionette.CONTEXT_CHROME)
        self.marionette.execute_script("""
            window.hideWindowFactory = {
                classId: Services.uuid.generateUUID(),
                QueryInterface: ChromeUtils.generateQI([
                    "nsIFactory",
                    "nsIMessengerWindowsIntegration"
                ]),
                createInstance(iid) {
                    return this.QueryInterface(iid);
                },
                hideWindowCount: 0,
                hideWindow() {
                    this.hideWindowCount++;
                }
            };

            const registrar = Components.manager.QueryInterface(Ci.nsIComponentRegistrar);
            const contractId = "@mozilla.org/messenger/osintegration;1";

            window.hideWindowFactory.oldClassId = registrar.contractIDToCID(contractId);
            registrar.registerFactory(window.hideWindowFactory.classId, "", contractId, window.hideWindowFactory);
        """)

    def tearDown(self):
        super().tearDown()

        self.marionette.execute_script("""
            const registrar = Components.manager.QueryInterface(Ci.nsIComponentRegistrar);
            const contractId = "@mozilla.org/messenger/osintegration;1";

            registrar.unregisterFactory(window.hideWindowFactory.classId, window.hideWindowFactory);
            registrar.registerFactory(window.hideWindowFactory.oldClassId, "", contractId, null);
            delete window.hideWindowFactory;
        """)

    def get_hideWindow_count(self):
        return self.marionette.execute_script("return window.hideWindowFactory.hideWindowCount")

    def test_close_to_tray(self):
        self.marionette.set_pref("mail.closeToTray", True)

        # Click the close button in the first window.
        self.assertEqual(0, self.get_hideWindow_count())

        close_button = self.marionette.find_element("css selector", "[titlebar-btn=close]")
        close_button.click()

        # The window should call hideWindow.
        self.assertEqual(1, self.get_hideWindow_count())

        # Open a second window.
        self.marionette.execute_script("openTab('calendar', {}, 'window')")
        Wait(self.marionette, timeout=10).until(
            lambda marionette: len(marionette.chrome_window_handles) == 2
        )

        # Click the close button in the second window.
        self.marionette.switch_to_window(self.marionette.chrome_window_handles[1])
        close_button = self.marionette.find_element("css selector", "[titlebar-btn=close]")
        close_button.click()

        # The window should close.
        Wait(self.marionette, timeout=10).until(
            lambda marionette: len(marionette.chrome_window_handles) == 1
        )

        # Click the close button in the first window.
        self.marionette.switch_to_window(self.marionette.chrome_window_handles[0])
        self.marionette.set_context(self.marionette.CONTEXT_CHROME)

        close_button = self.marionette.find_element("css selector", "[titlebar-btn=close]")
        close_button.click()

        # The window should call hideWindow.
        self.assertEqual(2, self.get_hideWindow_count())

        # Check if CTRL+W triggers close to tray.
        key_chain = self.marionette.actions.sequence("key", "keyboard_id")
        key_chain.key_down(Keys.CONTROL).key_down("w").key_up("w").key_up(Keys.CONTROL).perform()
        self.assertEqual(3, self.get_hideWindow_count())

        # Check if ALT+F4 triggers close to tray.
        key_chain.key_down(Keys.ALT).key_down(Keys.F4).key_up(Keys.F4).key_up(Keys.ALT).perform()
        self.assertEqual(4, self.get_hideWindow_count())
