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
from marionette_driver import errors
# isort: on


class ThunderbirdSignout(FeltTestsThunderbirdUi):
    """Sign out of the enterprise session from the Thunderbird main window.

    Everything except the confirmation dialog is shared with the Firefox test:
    BaseBrowserSignout.run_perform_signout() calls self._do_signout(), which
    resolves to the override below because self is a Thunderbird instance.
    """

    def test_thunderbird_signout(self):
        # Imported here so the Marionette harness does not collect and run
        # BrowserSignout from the Firefox test module.
        from test_felt_browser_signout import BaseBrowserSignout

        self.run_felt_base()
        BaseBrowserSignout.run_perform_signout(self)
        BaseBrowserSignout.run_prefilled_email_submit(self)
        BaseBrowserSignout.run_load_sso(self)
        BaseBrowserSignout.run_perform_sso_auth(self)
        BaseBrowserSignout.run_new_browser(self)

        # FELT restarted Thunderbird after the second sign in.
        self.assert_user_signed_in(env=Environment.FIREFOX)

    def _accept_signout_dialog(self):
        """Accept the sign out confirmation.

        Thunderbird has no gDialogBox, so the window-modal asyncConfirmEx()
        from EnterpriseHandler is routed by PromptParent to a separate modal
        commonDialog.xhtml window rather than to the in-window
        enterpriseCloseDialog Firefox uses. That is a real WebDriver user
        prompt, so it must be driven through the alert API: any other
        Marionette command issued while it is open fails with
        UnexpectedAlertOpenError, even under unhandledPromptBehavior=ignore.

        Accepting leaves the checkbox at its default (checked), so
        enterprise.prompt_on_signout stays enabled for the next sign out.
        """

        def dialog_is_open(driver):
            try:
                return driver.switch_to_alert().text is not None
            except errors.NoAlertPresentException:
                return False

        self._logger.info("Waiting for the signout confirmation dialog to open")
        self._child_wait.until(dialog_is_open)

        self._logger.info("Accepting the signout confirmation dialog")
        self._child_driver.switch_to_alert().accept()

    def _do_signout(self):
        """Thunderbird counterpart of BaseBrowserSignout._do_signout()."""
        from test_felt_browser_signout import BaseBrowserSignout

        self.assert_user_signed_in(env=Environment.FIREFOX)
        # Cache email for later use in prefilled email input field assertion
        user = self.get_logged_in_user_info(env=Environment.FIREFOX)
        self._signed_in_email = user["email"]

        self._child_driver.set_context("chrome")

        # Making sure we get to handle the Signout dialog
        assert (
            self._child_driver.session_capabilities.get("unhandledPromptBehavior") == "ignore"
        ), "Driver should not auto-handle prompt"

        self._logger.info("Clicking enterprise badge to open enterprise panel")
        self.get_elem_child("#enterprise-badge-toolbar-button").click()

        self._logger.info("Clicking signout button in enterprise panel")
        self.get_elem_child(".panelUI-enterprise__sign-out-btn").click()

        self._accept_signout_dialog()

        try:
            self._child_driver.set_context("content")
        except (
            errors.InvalidSessionIdException,
            errors.NoSuchWindowException,
            errors.TimeoutException,
            OSError,
        ):
            # Thunderbird quits immediately after the signout dialog is
            # accepted, so the connection may already be closed by the time we
            # reset its context. _child_driver is not used after this point.
            pass

        # This is not true but it will make sure the harness does not try to
        # cleanup Thunderbird and we can then make sure that our self-closing
        # is correct.
        self._manually_closed_child = True

        # Verify felt authentication window reloaded
        self.await_felt_auth_window()
        self.force_window()

        # Verify no user signed in in Felt
        self.assert_user_signed_out(env=Environment.FELT)

        # Verify no cookies from the previous sign in session
        cookies = BaseBrowserSignout.get_private_cookies(self)
        assert len(cookies) == 0, f"No private cookies, found {len(cookies)}"
