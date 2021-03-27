/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

this.EXPORTED_SYMBOLS = ["MatrixPowerLevels"];

var { XPCOMUtils, l10nHelper } = ChromeUtils.import(
  "resource:///modules/imXPCOMUtils.jsm"
);

XPCOMUtils.defineLazyGetter(this, "_", () =>
  l10nHelper("chrome://chat/locale/matrix.properties")
);

// See https://matrix.org/docs/spec/client_server/r0.5.0#m-room-power-levels
var MatrixPowerLevels = {
  user: 0,
  voice: 10,
  moderator: 50,
  admin: 100,
  /**
   * Turns a power level into a human readable string.
   * Only exactly matching level names are returned, except for restricted
   * power levels.
   *
   * @param {number} powerLevel - Power level to format.
   * @param {number} [defaultLevel=0] - The default power level in the room.
   * @returns {string} Representation of the power level including the raw level.
   */
  toText(powerLevel, defaultLevel = MatrixPowerLevels.user) {
    let levelName = _("powerLevel.custom");
    if (powerLevel == MatrixPowerLevels.admin) {
      levelName = _("powerLevel.admin");
    } else if (powerLevel == MatrixPowerLevels.moderator) {
      levelName = _("powerLevel.moderator");
    } else if (powerLevel < defaultLevel) {
      levelName = _("powerLevel.restricted");
    } else if (powerLevel == defaultLevel) {
      levelName = _("powerLevel.default");
    }
    return _("powerLevel.detailed", levelName, powerLevel);
  },
};
