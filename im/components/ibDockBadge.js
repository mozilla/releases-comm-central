/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is the Instantbird messenging client, released
 * 2009.
 *
 * The Initial Developer of the Original Code is
 * Florian QUEZE <florian@instantbird.org>.
 * Portions created by the Initial Developer are Copyright (C) 2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource:///modules/imServices.jsm");

XPCOMUtils.defineLazyServiceGetter(this, "dockBadgeService",
                                   "@instantbird.org/purple/nsdockbadgeservice;1",
                                   "nsIDockBadgeService");

function DockBadge() { }
DockBadge.prototype = {
  _badgeTimer: null,
  _showDockBadgePrefName: "messenger.options.showUnreadCountInDock",
  _getAttentionPrefName: "messenger.options.getAttentionOnNewMessages",
  _showUnreadCount: function() {
    dockBadgeService.badgeText = this._unreadCount || "";
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
    dockBadgeService.badgeText = "";
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

const NSGetFactory = XPCOMUtils.generateNSGetFactory([DockBadge]);
