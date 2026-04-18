/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Helper module for managing Message Retention UI settings shared between
 * Account Settings and Folder Properties.
 */
export const RetentionSettingsUI = {
  /**
   * Initialize UI elements from a retention settings object.
   *
   * @param {nsIMsgRetentionSettings} settings - The back-end settings object.
   */
  init(settings) {
    const useDefault = document.getElementById("retention-use-default");
    if (useDefault) {
      useDefault.checked = settings.useServerDefaults;
    }

    document.getElementById("retention-retain-by").value =
      settings.retainByPreference;

    document.getElementById("retention-days-to-keep-headers").value =
      settings.daysToKeepHdrs > 0 ? settings.daysToKeepHdrs : 30;

    document.getElementById("retention-num-headers-to-keep").value =
      settings.numHeadersToKeep > 0 ? settings.numHeadersToKeep : 2000;

    // UI "Always keep starred" is the inverse of "Apply policy to flagged".
    document.getElementById("retention-always-keep-starred").checked =
      !settings.applyToFlaggedMessages;
  },

  /**
   * Save UI values back into a retention settings object.
   *
   * @param {nsIMsgRetentionSettings} settings - The back-end settings object to mutate.
   * @returns {nsIMsgRetentionSettings} The mutated settings object.
   */
  save(settings) {
    const useDefault = document.getElementById("retention-use-default");
    if (useDefault) {
      settings.useServerDefaults = useDefault.checked;
    }

    settings.retainByPreference = document.getElementById(
      "retention-retain-by"
    ).value;
    settings.daysToKeepHdrs = document.getElementById(
      "retention-days-to-keep-headers"
    ).value;
    settings.numHeadersToKeep = document.getElementById(
      "retention-num-headers-to-keep"
    ).value;
    settings.applyToFlaggedMessages = !document.getElementById(
      "retention-always-keep-starred"
    ).checked;

    return settings;
  },

  /**
   * Disables or enables retention elements based on an override or the
   * "Use Default" checkbox state.
   *
   * @param {object} [options] - Optional settings.
   * @param {boolean} [options.force] - If provided, the UI state is ignored and
   * elements are set to this boolean value.
   * @returns {boolean} True if elements were disabled.
   */
  setDisabledStates({ force } = {}) {
    const disable =
      force !== undefined
        ? force
        : (document.getElementById("retention-use-default")?.checked ?? false);

    for (const id of [
      "retention-retain-by",
      "retention-num-headers-to-keep",
      "retention-days-to-keep-headers",
      "retention-messages",
      "retention-days-old",
      "retention-always-keep-starred",
    ]) {
      document.getElementById(id).disabled = disable;
    }
    document.getElementById("retention-removal-warning").hidden = disable;
    return disable;
  },

  /**
   * Update the disabled state of numeric inputs based on radio selection
   * and toggle the visibility of the removal warning.
   *
   * @param {string} serverType - The type of the incoming server (e.g., 'imap', 'pop3').
   * @param {object} [isLocked={}] - Map of element IDs to their locked status.
   */
  updateStates(serverType, isLocked = {}) {
    const selectionValue = document.getElementById("retention-retain-by").value;
    ["retention-days-to-keep-headers", "retention-num-headers-to-keep"].forEach(
      (id, index) => {
        // Radio value 2 = by age (index 0), Radio value 3 = by number (index 1)
        document.getElementById(id).disabled =
          isLocked[id] || selectionValue != index + 2;
      }
    );
    document.getElementById("retention-removal-warning").hidden =
      !["imap", "pop3", "ews"].includes(serverType) || selectionValue == 1;
  },
};
