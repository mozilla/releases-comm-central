/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineLazyGetter(lazy, "localization", () => {
  return new Localization(
    ["toolkit/enterprise/enterprise.ftl", "branding/brand.ftl"],
    true
  );
});

ChromeUtils.defineESModuleGetters(lazy, {
  initiateShutdown:
    "resource://gre/modules/enterprise/EnterpriseCommon.sys.mjs",
});

const PROMPT_ON_SIGNOUT_PREF = "enterprise.prompt_on_signout";

export const EnterpriseHandler = {
  /**
   * Shows the sign-out confirmation prompt, unless the user opted out of it.
   *
   * @param {Window} window - Chrome window the modal prompt is anchored to.
   * @returns {Promise<boolean>} true if the sign-out should proceed, false if
   *   the user cancelled.
   */
  async showSignoutPrompt(window) {
    const warnOnSignout = Services.prefs.getBoolPref(
      PROMPT_ON_SIGNOUT_PREF,
      true
    );

    // If the user has disabled the prompt, we can skip showing the prompt.
    if (!warnOnSignout) {
      return true;
    }

    const flags =
      Services.prompt.BUTTON_TITLE_IS_STRING * Services.prompt.BUTTON_POS_0 +
      Services.prompt.BUTTON_TITLE_CANCEL * Services.prompt.BUTTON_POS_1 +
      Services.prompt.BUTTON_POS_0_DEFAULT;

    const [title, message, reauthNotice, checkLabel, signoutBtnLabel] =
      await lazy.localization.formatValues([
        { id: "enterprise-close-prompt-title" },
        { id: "enterprise-close-prompt-message" },
        { id: "enterprise-close-prompt-message-reauth" },
        { id: "enterprise-close-prompt-checkbox-label" },
        { id: "enterprise-close-prompt-primary-btn-label" },
      ]);

    // buttonPressed will be 0 for Signout and 1 for Cancel
    const result = await Services.prompt.asyncConfirmEx(
      window.browsingContext,
      Services.prompt.MODAL_TYPE_WINDOW,
      title,
      `${message}\n\n${reauthNotice}`,
      flags,
      signoutBtnLabel,
      null,
      null,
      checkLabel,
      true // checkbox checked
    );

    if (result.get("buttonNumClicked") !== 0) {
      // User cancelled signout. Also ignore any checkbox toggling.
      return false;
    }

    Services.prefs.setBoolPref(PROMPT_ON_SIGNOUT_PREF, result.get("checked"));

    // User confirmed signout. Proceed with signout in `onSignOut`.
    return true;
  },

  /**
   * Handles the sign out button in the enterprise panel. Shows the sign-out
   * confirmation prompt then performs a full sign out and quits.
   *
   * @param {Window} window - Chrome window the command was invoked from.
   */
  async onSignOut(window) {
    if (!(await this.showSignoutPrompt(window))) {
      return;
    }

    lazy.initiateShutdown();
  },
};
