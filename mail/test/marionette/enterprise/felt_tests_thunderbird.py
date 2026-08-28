# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

import os
import sys

here = os.path.abspath(__file__)
repo_root = os.path.normpath(os.path.join(here, *[".."] * 6))
sys.path.append(os.path.join(repo_root, "testing", "enterprise"))

from felt_tests import FeltTests


class FeltTestsThunderbird(FeltTests):
    def open_tab_child(self, url):
        with self._child_driver.using_context(self._child_driver.CONTEXT_CHROME):
            self._child_driver.execute_script("""
                const url = arguments[0];
                const mainWin = Services.wm.getMostRecentWindow("mail:3pane");
                const tabmail = mainWin.document.getElementById("tabmail");
                const oldShouldSwitchTo = tabmail.tabModes["contentTab"].shouldSwitchTo;
                tabmail.tabModes["contentTab"].shouldSwitchTo = () => {
                    return -1;
                };
                tabmail.openTab("contentTab", { url });
                tabmail.tabModes["contentTab"].shouldSwitchTo = oldShouldSwitchTo;
            """, [ url ])

    def close_tab_child(self):
        with self._child_driver.using_context(self._child_driver.CONTEXT_CHROME):
            self._child_driver.execute_script("""
                const mainWin = Services.wm.getMostRecentWindow("mail:3pane");
                const tabmail = mainWin.document.getElementById("tabmail");
                tabmail.closeTab();
            """)


    def get_tab(self, url):
        with self._child_driver.using_context(self._child_driver.CONTEXT_CHROME):
            return self._child_driver.execute_script("""
                const url = arguments[0];
                const mainWin = Services.wm.getMostRecentWindow("mail:3pane");
                return [...mainWin.document.querySelectorAll("browser")].filter(b => b.docShell?.document?.location == url)[0];
            """, [ url ])

    def get_current_tab(self):
        with self._child_driver.using_context(self._child_driver.CONTEXT_CHROME):
            return self._child_driver.execute_script("""
                const mainWin = Services.wm.getMostRecentWindow("mail:3pane");
                const tabmail = mainWin.document.getElementById("tabmail");
                return tabmail._getTabContextForTabbyThing(null, true)[1].browser;
            """)

    def get_current_uri(self):
        with self._child_driver.using_context(self._child_driver.CONTEXT_CHROME):
            tab = self.get_current_tab()
            return self._child_driver.execute_script("""
                return arguments[0].docShell?.currentDocumentChannel?.originalURI?.spec;
            """, [tab])

    def get_elem_child(self, selector):
        with self._child_driver.using_context(self._child_driver.CONTEXT_CHROME):
            tab = self.get_current_tab()
            return self._child_driver.execute_script("""
                return arguments[0].docShell.document.querySelector(arguments[1]);
            """, [ tab, selector ])
