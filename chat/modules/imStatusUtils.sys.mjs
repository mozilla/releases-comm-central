/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineLazyGetter(
  lazy,
  "l10n",
  () => new Localization(["chat/status.ftl"], true)
);

var statusAttributes = {};
statusAttributes[Ci.imIStatusInfo.STATUS_UNKNOWN] = "unknown";
statusAttributes[Ci.imIStatusInfo.STATUS_OFFLINE] = "offline";
statusAttributes[Ci.imIStatusInfo.STATUS_INVISIBLE] = "invisible";
statusAttributes[Ci.imIStatusInfo.STATUS_MOBILE] = "mobile";
statusAttributes[Ci.imIStatusInfo.STATUS_IDLE] = "idle";
statusAttributes[Ci.imIStatusInfo.STATUS_AWAY] = "away";
statusAttributes[Ci.imIStatusInfo.STATUS_UNAVAILABLE] = "unavailable";
statusAttributes[Ci.imIStatusInfo.STATUS_AVAILABLE] = "available";

export var Status = {
  toAttribute: aStatusType =>
    aStatusType in statusAttributes ? statusAttributes[aStatusType] : "unknown",

  _labels: {},
  toLabel(aStatusType, aStatusText) {
    // aStatusType may be either one of the (integral) imIStatusInfo status
    // constants, or one of the statusAttributes.
    if (!(typeof aStatusType == "string")) {
      aStatusType = this.toAttribute(aStatusType);
    }

    if (!(aStatusType in this._labels)) {
      this._labels[aStatusType] = lazy.l10n.formatValueSync(
        `${aStatusType}-status-type`
      );
    }

    let label = this._labels[aStatusType];
    if (aStatusText) {
      label = lazy.l10n.formatValueSync("status-with-status-message", {
        statusType: label,
        statusMessage: aStatusText,
      });
    }

    return label;
  },

  toFlag(aAttribute) {
    for (const flag in statusAttributes) {
      if (statusAttributes[flag] == aAttribute) {
        return flag;
      }
    }
    return Ci.imIStatusInfo.STATUS_UNKNOWN;
  },
};
