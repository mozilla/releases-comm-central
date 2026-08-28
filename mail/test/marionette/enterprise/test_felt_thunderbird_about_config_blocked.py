#!/usr/bin/env python3
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

import os
import sys
import time

sys.path.append(os.path.dirname(__file__))

from felt_tests_thunderbird import FeltTestsThunderbird

# isort: off
from felt_consts import firefox_config
# isort: on


class ThunderbirdAboutConfigBlocked(FeltTestsThunderbird):
    def test_thunderbird_about_config_blocked(self):
        self.run_felt_base()
        self.connect_child_browser()

        self._logger.info("Blocked by applied policy, should block")
        self.run_about_config_blocked_in_thunderbird()

        self._logger.info("Unblocking, should allow")
        self.run_change_about_config_policy(0)
        self.run_about_config_allowed_in_thunderbird()

        self._logger.info("Blocking explicitly, should block")
        self.run_change_about_config_policy(1)
        self.run_about_config_blocked_in_thunderbird()

        self._logger.info("Removing policy, should allow")
        self.run_change_about_config_policy(-1)
        self.run_about_config_allowed_in_thunderbird()

        self._logger.info("Blocking again")
        self.run_change_about_config_policy(1)
        self.run_about_config_blocked_in_thunderbird()

        self._logger.info("Unblocking, setting previous value")
        self.run_change_about_config_policy(0)
        self.run_about_config_allowed_in_thunderbird()

        self._logger.info("Removing policy, should allow")
        self.run_change_about_config_policy(-1)
        self.run_about_config_allowed_in_thunderbird()

    def run_change_about_config_policy(self, new_value):
        self._logger.info("Changing BlockAboutConfig policy")
        self.policy_block_about_config.value = new_value

        # Polling frequency + 1s
        waiting_time = (firefox_config["polling_frequency"]["pref_value"] / 1000) + 1
        # Give time to make sure Policy got applied
        time.sleep(waiting_time)
        self._logger.info(
            f"Policy should have been applied after waiting {waiting_time}s, continue tests"
        )

    def run_about_config_blocked_in_thunderbird(self):
        self._logger.info("Checking about:config is blocked in thunderbird")

        self.open_tab_child("about:config")
        location = self.get_current_uri()
        assert location.startswith(
            "about:neterror?e=blockedByPolicyEnterprise&u=about%3Aconfig"
        ), f"about:config is blocked in Thunderbird but location: {location}"

    def run_about_config_allowed_in_thunderbird(self):
        self._logger.info("Checking about:config is allowed in thunderbird")

        self.open_tab_child("about:config")
        caution = self.get_elem_child(".config-help-text")
        assert caution is not None, "Expected access to about:config to be allowed."
