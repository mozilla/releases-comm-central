#!/usr/bin/env python3
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

import os
import sys

sys.path.append(os.path.dirname(__file__))

from felt_tests_thunderbird import FeltTestsThunderbirdUi

# isort: off
from base_test import Environment
# isort: on


class ThunderbirdEnterpriseBadgeTests(FeltTestsThunderbirdUi):
    def test_enterprise_browser_ui(self):
        # Import here so Marionette test harness does not try to execute
        # EnterpriseBadgeTests
        from test_felt_browser_enterprise_toolbar_button import EnterpriseBadgeTests

        super().run_felt_base()
        self.connect_child_browser()
        EnterpriseBadgeTests.assert_user_signed_in(self, env=Environment.FIREFOX)
        EnterpriseBadgeTests.assert_enterprise_badge_and_panel(self)
        EnterpriseBadgeTests.assert_enterprise_panel_accessible_by_keypress(self)
