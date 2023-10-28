/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from sanitize.js */

var gSanitizePromptDialog = {
  get bundleBrowser() {
    if (!this._bundleBrowser) {
      this._bundleBrowser = document.getElementById("bundleBrowser");
    }
    return this._bundleBrowser;
  },

  get selectedTimespan() {
    var durList = document.getElementById("sanitizeDurationChoice");
    return parseInt(durList.value);
  },

  get warningBox() {
    return document.getElementById("sanitizeEverythingWarningBox");
  },

  init() {
    // This is used by selectByTimespan() to determine if the window has loaded.
    this._inited = true;

    var s = new Sanitizer();
    s.prefDomain = "privacy.cpd.";

    document.getElementById("sanitizeDurationChoice").value =
      Services.prefs.getIntPref("privacy.sanitize.timeSpan");

    const sanitizeItemList = document.querySelectorAll(
      "#historyGroup > [preference]"
    );
    for (const prefItem of sanitizeItemList) {
      const name = s.getNameFromPreference(prefItem.getAttribute("preference"));
      if (!s.canClearItem(name)) {
        prefItem.preference = null;
        prefItem.checked = false;
        prefItem.disabled = true;
      } else {
        prefItem.checked = Services.prefs.getBoolPref(
          prefItem.getAttribute("preference")
        );
      }
    }

    this.onReadGeneric();

    document.querySelector("dialog").getButton("accept").label =
      this.bundleBrowser.getString("sanitizeButtonOK");

    const warningIcon = document.getElementById(
      "sanitizeEverythingWarningIcon"
    );
    warningIcon.setAttribute(
      "src",
      "chrome://messenger/skin/icons/new/activity/warning.svg"
    );

    if (this.selectedTimespan === Sanitizer.TIMESPAN_EVERYTHING) {
      this.prepareWarning();
      this.warningBox.hidden = false;
      document.title = this.bundleBrowser.getString(
        "sanitizeDialog2.everything.title"
      );
    } else {
      this.warningBox.hidden = true;
    }
  },

  selectByTimespan() {
    // This method is the onselect handler for the duration dropdown.  As a
    // result it's called a couple of times before onload calls init().
    if (!this._inited) {
      return;
    }

    var warningBox = this.warningBox;

    // If clearing everything
    if (this.selectedTimespan === Sanitizer.TIMESPAN_EVERYTHING) {
      this.prepareWarning();
      if (warningBox.hidden) {
        warningBox.hidden = false;
      }
      window.sizeToContent();
      window.document.title = this.bundleBrowser.getString(
        "sanitizeDialog2.everything.title"
      );
      return;
    }

    // If clearing a specific time range
    if (!warningBox.hidden) {
      window.resizeBy(0, -warningBox.getBoundingClientRect().height);
      warningBox.hidden = true;
    }
    window.document.title =
      window.document.documentElement.getAttribute("noneverythingtitle");
  },

  sanitize() {
    // Update pref values before handing off to the sanitizer (bug 453440)
    this.updatePrefs();
    var s = new Sanitizer();
    s.prefDomain = "privacy.cpd.";

    s.range = Sanitizer.getClearRange(this.selectedTimespan);
    s.ignoreTimespan = !s.range;

    try {
      s.sanitize();
    } catch (er) {
      console.error("Exception during sanitize: " + er);
    }
  },

  /**
   * If the panel that displays a warning when the duration is "Everything" is
   * not set up, sets it up.  Otherwise does nothing.
   */
  prepareWarning() {
    // If the date and time-aware locale warning string is ever used again,
    // initialize it here.  Currently we use the no-visits warning string,
    // which does not include date and time.  See bug 480169 comment 48.

    var warningStringID;
    if (this.hasNonSelectedItems()) {
      warningStringID = "sanitizeSelectedWarning";
    } else {
      warningStringID = "sanitizeEverythingWarning2";
    }

    var warningDesc = document.getElementById("sanitizeEverythingWarning");
    warningDesc.textContent = this.bundleBrowser.getString(warningStringID);
  },

  /**
   * Called when the value of a preference element is synced from the actual
   * pref.  Enables or disables the OK button appropriately.
   */
  onReadGeneric() {
    var found = false;

    // Find any other pref that's checked and enabled.
    const sanitizeItemList = document.querySelectorAll(
      "#historyGroup > [preference]"
    );
    for (const prefItem of sanitizeItemList) {
      found = !prefItem.disabled && prefItem.checked;
      if (found) {
        break;
      }
    }

    try {
      document.querySelector("dialog").getButton("accept").disabled = !found;
    } catch (e) {}

    // Update the warning prompt if needed
    this.prepareWarning();

    return undefined;
  },

  /**
   * Sanitizer.prototype.sanitize() requires the prefs to be up-to-date.
   * Because the type of this prefwindow is "child" -- and that's needed because
   * without it the dialog has no OK and Cancel buttons -- the prefs are not
   * updated on dialogaccept on platforms that don't support instant-apply
   * (i.e., Windows).  We must therefore manually set the prefs from their
   * corresponding preference elements.
   */
  updatePrefs() {
    Sanitizer.prefs.setIntPref("timeSpan", this.selectedTimespan);

    // Now manually set the prefs from their corresponding preference elements.
    const sanitizeItemList = document.querySelectorAll(
      "#historyGroup > [preference]"
    );
    for (const prefItem of sanitizeItemList) {
      const prefName = prefItem.getAttribute("preference");
      Services.prefs.setBoolPref(prefName, prefItem.checked);
    }
  },

  /**
   * Check if all of the history items have been selected like the default status.
   */
  hasNonSelectedItems() {
    const sanitizeItemList = document.querySelectorAll(
      "#historyGroup > [preference]"
    );
    for (const prefItem of sanitizeItemList) {
      if (!prefItem.checked) {
        return true;
      }
    }
    return false;
  },
};

document.addEventListener("dialogaccept", () =>
  gSanitizePromptDialog.sanitize()
);
