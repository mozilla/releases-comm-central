#!/usr/bin/env python3
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

import os
import sys

sys.path.append(os.path.dirname(__file__))

from felt_tests_thunderbird import FeltTestsThunderbird


class FeltStartsThunderbird(FeltTestsThunderbird):
    def test_felt_thunderbird_starts(self):
        self.run_felt_base()
        self.connect_child_browser()

        with self._child_driver.using_context(self._child_driver.CONTEXT_CHROME):
            client_cookies = self._child_driver.execute_script("""
                const host = arguments[0];
                const cookies = [];
                for (const cookie of Services.cookies.getCookiesFromHost(host, {})) {
                    cookies.push({
                        name:  cookie.name,
                        value: cookie.value,
                        host:  cookie.host,
                        path:  cookie.path,
                    });
                }
                return cookies;
            """, ["localhost"] # Console address' host
            )

        expected_cookie = list(
            filter(
                lambda x: (
                    x["name"] == self.cookie_name.value
                    and x["value"] == self.cookie_value.value
                ),
                client_cookies,
            )
        )
        assert len(expected_cookie) == 1, (
            f"Cookie {self.cookie_name} was properly set on Thunderbird started by FELT"
        )
