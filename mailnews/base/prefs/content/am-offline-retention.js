/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.defineESModuleGetters(
  this,
  {
    RetentionSettingsUI: "chrome://messenger/content/RetentionSettingsUI.mjs",
  },
  { global: "current" }
);

window.addEventListener("DOMContentLoaded", () => gRetentionDialog.onInit());
document.addEventListener("dialogaccept", () => gRetentionDialog.onSave());

var gRetentionDialog = {
  _incomingServer: null,
  _serverType: null,
  _lockedPrefs: {},

  /**
   * Initialize the retention dialog, loading settings from the server
   * and checking for locked preferences.
   */
  onInit() {
    // Arguments passed from parent.gSubDialog.open
    this._incomingServer = window.arguments[0].server;
    this._serverType = this._incomingServer.type;

    RetentionSettingsUI.init(this._incomingServer.retentionSettings);

    // Determine which preferences are locked by administrator policy and
    // update the UI to reflect those restrictions.

    const branch = Services.prefs.getBranch(
      `mail.server.${this._incomingServer.key}.`
    );

    if (branch.prefIsLocked("retainBy")) {
      RetentionSettingsUI.setDisabledStates({ force: true });
      return;
    }

    for (const prefElement of [
      { prefstring: "daysToKeepHdrs", id: "retention-days-to-keep-headers" },
      { prefstring: "numHdrsToKeep", id: "retention-num-headers-to-keep" },
      {
        prefstring: "applyToFlaggedMessages",
        id: "retention-always-keep-starred",
      },
    ]) {
      const disable = branch.prefIsLocked(prefElement.prefstring);
      const id = prefElement.id;
      document.getElementById(id).disabled = disable;
      this._lockedPrefs[id] = disable;
    }

    this.onSelectionChanged();
  },

  /**
   * Save the dialog's UI values back to the server's retention settings.
   */
  onSave() {
    this._incomingServer.retentionSettings = RetentionSettingsUI.save(
      this._incomingServer.retentionSettings
    );
  },

  /**
   * Trigger an update of the input enabled states when the radio selection changes.
   */
  onSelectionChanged() {
    RetentionSettingsUI.updateStates(this._serverType, this._lockedPrefs);
  },
};
