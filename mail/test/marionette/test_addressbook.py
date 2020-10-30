# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""Test the behavior of the address book UI"""

from __future__ import print_function, unicode_literals, absolute_import

from marionette_driver import By, Wait
from marionette_driver.keys import Keys
from marionette_harness import MarionetteTestCase
from marionette_harness.runner.mixins.window_manager import WindowManagerMixin


class TestAddressBook(WindowManagerMixin, MarionetteTestCase):
    def setUp(self):
        super(TestAddressBook, self).setUp()

        if self.marionette.session_capabilities["platformName"] == "mac":
            self.mod_key = Keys.META
        else:
            self.mod_key = Keys.CONTROL

    # Helpers

    def currentElement(self):
        """Return the currently focused element"""
        return self.marionette.execute_script(
            """return top.document.commandDispatcher.focusedElement"""
        )

    def isFocused(self, e):
        cur = self.currentElement()
        return e.get_attribute("focused") == "true" or (cur != None and cur == e)

    def waitFocused(self, e):
        """Wait for an element to get focused"""
        Wait(self.marionette).until(lambda _: self.isFocused(e))

    def _start_addressbook(self):
        """Start the address book window"""

        def open_addressbook(_):
            w = self.marionette.find_element(By.TAG_NAME, "window")
            w.send_keys(self.mod_key, Keys.SHIFT, "b")

        neww = self.open_window(callback=open_addressbook)
        self.marionette.switch_to_window(neww)

    def _close_addressbook(self):
        """Close the address book window"""
        w = self.marionette.find_element(By.TAG_NAME, "window")
        w.send_keys(self.mod_key, "w")

    # Actual tests

    def test_addressbook_F6focus(self):
        """Test that the F6 key properly focuses the different panels"""
        self.marionette.set_context("chrome")
        self._start_addressbook()
        w = self.marionette.find_element(By.TAG_NAME, "window")

        # Focus starts on result tree
        e = w.find_element(By.ID, "abResultsTree")
        self.waitFocused(e)

        # Without a contact selected, F6 brings to dirtree
        e.send_keys(Keys.F6)
        e = w.find_element(By.ID, "dirTree")
        self.waitFocused(e)

        # F6 brings to search input
        e.send_keys(Keys.F6)
        e = w.find_element(By.ID, "peopleSearchInput")
        self.waitFocused(e)

        # F6 brings back to result tree
        e.send_keys(Keys.F6)
        e = w.find_element(By.ID, "abResultsTree")
        self.waitFocused(e)

        # shift-F6 brings back to search input
        e.send_keys(Keys.SHIFT, Keys.F6)
        e = w.find_element(By.ID, "peopleSearchInput")
        self.waitFocused(e)

        # shift-F6 brings back to dirtree
        e.send_keys(Keys.SHIFT, Keys.F6)
        e = w.find_element(By.ID, "dirTree")
        self.waitFocused(e)

        # Without a contact selected, shift-F6 brings back to result tree
        e.send_keys(Keys.SHIFT, Keys.F6)
        e = w.find_element(By.ID, "abResultsTree")
        self.waitFocused(e)

        self._close_addressbook()
