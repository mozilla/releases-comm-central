/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

this.EXPORTED_SYMBOLS = ["Status"];

var {interfaces: Ci, utils: Cu} = Components;

Cu.import("resource:///modules/imXPCOMUtils.jsm");
Cu.import("resource:///modules/imServices.jsm");

XPCOMUtils.defineLazyGetter(this, "_", () =>
  l10nHelper("chrome://chat/locale/status.properties")
);

var imIStatusInfo = Ci.imIStatusInfo;
var statusAttributes = {};
statusAttributes[imIStatusInfo.STATUS_UNKNOWN] = "unknown";
statusAttributes[imIStatusInfo.STATUS_OFFLINE] = "offline";
statusAttributes[imIStatusInfo.STATUS_INVISIBLE] = "invisible";
statusAttributes[imIStatusInfo.STATUS_MOBILE] = "mobile";
statusAttributes[imIStatusInfo.STATUS_IDLE] = "idle";
statusAttributes[imIStatusInfo.STATUS_AWAY] = "away";
statusAttributes[imIStatusInfo.STATUS_UNAVAILABLE] = "unavailable";
statusAttributes[imIStatusInfo.STATUS_AVAILABLE] = "available";

var Status = {
  toAttribute: aStatusType =>
    aStatusType in statusAttributes ? statusAttributes[aStatusType] : "unknown",

  _labels: {},
  toLabel: function(aStatusType, aStatusText) {
    // aStatusType may be either one of the (integral) imIStatusInfo status
    // constants, or one of the statusAttributes.
    if (!(typeof aStatusType == "string"))
      aStatusType = this.toAttribute(aStatusType);

    if (!(aStatusType in this._labels))
      this._labels[aStatusType] = _(aStatusType + "StatusType");

    let label = this._labels[aStatusType];
    if (aStatusText)
      label = _("statusWithStatusMessage", label, aStatusText);

    return label;
  },

  toFlag: function(aAttribute) {
    for (let flag in statusAttributes)
      if (statusAttributes[flag] == aAttribute)
        return flag;
    return imIStatusInfo.STATUS_UNKNOWN;
  }
};
