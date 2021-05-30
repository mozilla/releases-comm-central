/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { Sanitizer } = ChromeUtils.import("resource:///modules/Sanitizer.jsm");

var gSanitizePromptDialog = {

  get bundleSanitize() {
    if (!this._bundleSanitize)
      this._bundleSanitize = document.getElementById("bundleSanitize");
    return this._bundleSanitize;
  },

  get selectedTimespan() {
    var durList = document.getElementById("sanitizeDurationChoice");
    return parseInt(durList.value);
  },

  get sanitizePreferences() {
    if (!this._sanitizePreferences) {
      this._sanitizePreferences =
        document.getElementById("sanitizePreferences");
    }
    return this._sanitizePreferences;
  },

  init() {
    document.documentElement.getButton("accept").label =
      this.bundleSanitize.getString("sanitizeButtonOK");
  },

  sanitize() {
    // Update pref values before handing off to the sanitizer.
    this.updatePrefs();

    // As the sanitize is async, we disable the buttons, update the label on
    // the 'accept' button to indicate things are happening and return false.
    // Once the async operation completes (either with or without errors)
    // we close the window.
    let docElt = document.documentElement;
    let acceptButton = docElt.getButton("accept");
    acceptButton.disabled = true;
    acceptButton.setAttribute("label",
                              this.bundleSanitize
                                  .getString("sanitizeButtonClearing"));
    docElt.getButton("cancel").disabled = true;

    try {
      let range = Sanitizer.getClearRange(this.selectedTimespan);
      let options = {
        ignoreTimespan: !range,
        range,
      };
      Sanitizer.sanitize(null, options)
        .catch(Cu.reportError)
        .then(() => window.close())
        .catch(Cu.reportError);
      return false;
    } catch (er) {
      Cu.reportError("Exception during sanitize: " + er);
      return true; // We *do* want to close immediately on error.
    }
  },

  /**
   * Called when the value of a preference element is synced from the actual
   * pref.  Enables or disables the OK button appropriately.
   */
  onReadGeneric() {
    var found = false;

    // Find any other pref that's checked and enabled.
    var i = 0;
    while (!found && i < this.sanitizePreferences.childNodes.length) {
      var preference = this.sanitizePreferences.childNodes[i];

      found = !!preference.value &&
              !preference.disabled;
      i++;
    }

    try {
      document.documentElement.getButton("accept").disabled = !found;
    } catch (e) { }

    return undefined;
  },

  /**
   * Sanitizer.prototype.sanitize() requires the prefs to be up-to-date.
   * Because the type of this prefwindow is "child" -- and that's needed
   * because without it the dialog has no OK and Cancel buttons -- the
   * prefs are not updated on dialogaccept on platforms that don't support
   * instant-apply (i.e., Windows).  We must therefore manually set the prefs
   * from their corresponding preference elements.
   */
  updatePrefs() {
    Services.prefs.setIntPref(Sanitizer.PREF_TIMESPAN, this.selectedTimespan);

    // Now manually set the prefs from their corresponding preference
    // elements.
    var prefs = this.sanitizePreferences.rootBranch;
    for (let i = 0; i < this.sanitizePreferences.childNodes.length; ++i) {
      var p = this.sanitizePreferences.childNodes[i];
      prefs.setBoolPref(p.name, p.value);
    }
  },
};
