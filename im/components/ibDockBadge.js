/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {classes: Cc, interfaces: Ci, utils: Cu} = Components;
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource:///modules/imServices.jsm");

XPCOMUtils.defineLazyServiceGetter(this, "MacDock",
                                   "@mozilla.org/widget/macdocksupport;1",
                                   "nsIMacDockSupport");

function DockBadge() { }
DockBadge.prototype = {
  _badgeTimer: null,
  _showDockBadgePrefName: "messenger.options.showUnreadCountInDock",
  _getAttentionPrefName: "messenger.options.getAttentionOnNewMessages",
  _showUnreadCount: function() {
    MacDock.badgeText = this._unreadCount || "";
  },
  _displayUnreadCountInDockBadge: function() {
    if (!Services.prefs.getBoolPref(this._showDockBadgePrefName))
      return;

    if (this._unreadCount == 1 &&
        Services.prefs.getBoolPref(this._getAttentionPrefName)) {
      // We use a timer because it looks better to add the dock
      // badge only after the dock item has stopped jumping.
      if (!this._badgeTimer)
        this._badgeTimer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
      this._badgeTimer.initWithCallback(this._showUnreadCount.bind(this),
                                        1000, Ci.nsITimer.TYPE_ONE_SHOT);
    }
    else
      this._showUnreadCount();
  },
  _hideUnreadCountDockBadge: function() {
    if (this._badgeTimer)
      this._badgeTimer.cancel();
    MacDock.badgeText = "";
  },

  observe: function(aSubject, aTopic, aData) {
    switch (aTopic) {
    case "profile-after-change":
      Services.obs.addObserver(this, "unread-im-count-changed", false);
      Services.prefs.addObserver(this._showDockBadgePrefName, this, false);
      break;
    case "nsPref:changed":
      if (aData == this._showDockBadgePrefName) {
        if (Services.prefs.getBoolPref(aData))
          this._showUnreadCount();
        else
          this._hideUnreadCountDockBadge();
      }
      break;
    case "unread-im-count-changed":
      if (!(this._unreadCount = parseInt(aData)))
        this._hideUnreadCountDockBadge();
      else
        this._displayUnreadCountInDockBadge();
      break;
    }
  },

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver]),
  classDescription: "DockBadge",
  classID: Components.ID("{8b1eb1be-a58c-450b-8250-c6d5ad9fe2fb}"),
  contractID: "@instantbird.org/mac/dock-badge;1"
};

var NSGetFactory = XPCOMUtils.generateNSGetFactory([DockBadge]);
