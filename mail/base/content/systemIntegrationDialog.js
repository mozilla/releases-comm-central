/* -*- Mode: Javascript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This dialog can only be opened if we have a shell service.

var { SearchIntegration } = ChromeUtils.import(
  "resource:///modules/SearchIntegration.jsm"
);

var gSystemIntegrationDialog = {
  _shellSvc: Cc["@mozilla.org/mail/shell-service;1"].getService(
    Ci.nsIShellService
  ),

  _mailCheckbox: null,

  _newsCheckbox: null,

  _rssCheckbox: null,

  _startupCheckbox: null,

  _searchCheckbox: null,

  onLoad() {
    // initialize elements
    this._mailCheckbox = document.getElementById("checkMail");
    this._newsCheckbox = document.getElementById("checkNews");
    this._rssCheckbox = document.getElementById("checkRSS");
    this._calendarCheckbox = document.getElementById("checkCalendar");
    this._startupCheckbox = document.getElementById("checkOnStartup");
    this._searchCheckbox = document.getElementById("searchIntegration");

    // Initialize the check boxes based on the default app states.
    this._mailCheckbox.disabled = this._shellSvc.isDefaultClient(
      false,
      this._shellSvc.MAIL
    );

    const calledFromPrefs =
      "arguments" in window && window.arguments[0] == "calledFromPrefs";

    if (!calledFromPrefs) {
      // As an optimization, if we aren't already the default mail client,
      // then pre-check that option for the user. We'll leave News and RSS alone.
      // Do this only if we are not called from the Preferences (Options) dialog.
      // In that case, the user may want to just check what the current state is.
      this._mailCheckbox.checked = true;
    } else {
      this._mailCheckbox.checked = this._mailCheckbox.disabled;

      // If called from preferences, use only a simpler "Cancel" label on the
      // cancel button.
      document.querySelector("dialog").getButton("cancel").label = document
        .querySelector("dialog")
        .getAttribute("buttonlabelcancel2");
    }

    if (!this._mailCheckbox.disabled) {
      this._mailCheckbox.removeAttribute("tooltiptext");
    }

    this._newsCheckbox.checked = this._newsCheckbox.disabled =
      this._shellSvc.isDefaultClient(false, this._shellSvc.NEWS);
    if (!this._newsCheckbox.disabled) {
      this._newsCheckbox.removeAttribute("tooltiptext");
    }

    this._rssCheckbox.checked = this._rssCheckbox.disabled =
      this._shellSvc.isDefaultClient(false, this._shellSvc.RSS);
    if (!this._rssCheckbox.disabled) {
      this._rssCheckbox.removeAttribute("tooltiptext");
    }

    this._calendarCheckbox.checked = this._calendarCheckbox.disabled =
      this._shellSvc.isDefaultClient(false, this._shellSvc.CALENDAR);

    // read the raw pref value and not shellSvc.shouldCheckDefaultMail
    this._startupCheckbox.checked = Services.prefs.getBoolPref(
      "mail.shell.checkDefaultClient"
    );

    // Search integration - check whether we should show/disable integration options
    if (SearchIntegration) {
      this._searchCheckbox.checked = SearchIntegration.prefEnabled;
      // On Windows, do not offer the option on startup as it does not perform well.
      if (
        Services.appinfo.OS == "WINNT" &&
        !calledFromPrefs &&
        !this._searchCheckbox.checked
      ) {
        this._searchCheckbox.hidden = true;
        // Even if the user wasn't presented the choice,
        // we do not want to ask again automatically.
        SearchIntegration.firstRunDone = true;
      } else if (!SearchIntegration.osVersionTooLow) {
        // Hide/disable the options if the OS does not support them.
        this._searchCheckbox.hidden = false;
        if (SearchIntegration.osComponentsNotRunning) {
          this._searchCheckbox.checked = false;
          this._searchCheckbox.disabled = true;
        }
      }
    }
  },

  /**
   * Called when the dialog is closed by any button.
   *
   * @param aSetAsDefault  If true, set TB as the default application for the
   *                       checked actions (mail/news/rss). Otherwise do nothing.
   */
  onDialogClose(aSetAsDefault) {
    // In all cases, save the user's decision for "always check at startup".
    this._shellSvc.shouldCheckDefaultClient = this._startupCheckbox.checked;

    // If the search checkbox is exposed, the user had the chance to make his choice.
    // So do not ask next time.
    const searchIntegPossible = !this._searchCheckbox.hidden;
    if (searchIntegPossible) {
      SearchIntegration.firstRunDone = true;
    }

    // If the "skip integration" button was used do not set any defaults
    // and close the dialog.
    if (!aSetAsDefault) {
      // Disable search integration in this case.
      if (searchIntegPossible) {
        SearchIntegration.prefEnabled = false;
      }

      return true;
    }

    // For each checked item, if we aren't already the default client,
    // make us the default.
    let appTypes = 0;

    if (
      this._mailCheckbox.checked &&
      !this._shellSvc.isDefaultClient(false, this._shellSvc.MAIL)
    ) {
      appTypes |= this._shellSvc.MAIL;
    }

    if (
      this._newsCheckbox.checked &&
      !this._shellSvc.isDefaultClient(false, this._shellSvc.NEWS)
    ) {
      appTypes |= this._shellSvc.NEWS;
    }

    if (
      this._rssCheckbox.checked &&
      !this._shellSvc.isDefaultClient(false, this._shellSvc.RSS)
    ) {
      appTypes |= this._shellSvc.RSS;
    }

    if (
      this._calendarCheckbox.checked &&
      !this._shellSvc.isDefaultClient(false, this._shellSvc.CALENDAR)
    ) {
      appTypes |= this._shellSvc.CALENDAR;
    }

    if (appTypes) {
      this._shellSvc.setDefaultClient(false, appTypes);
    }

    // Set the search integration pref if it is changed.
    // The integration will handle the rest.
    if (searchIntegPossible) {
      SearchIntegration.prefEnabled = this._searchCheckbox.checked;
    }

    return true;
  },
};

document.addEventListener("dialogaccept", () =>
  gSystemIntegrationDialog.onDialogClose(true)
);
document.addEventListener("dialogcancel", () =>
  gSystemIntegrationDialog.onDialogClose(false)
);
