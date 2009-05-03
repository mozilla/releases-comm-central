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

var unreadCountKeeper = {
  _unreadCount: 0,
  _badgeTimeout: null,
  get dockBadgeService() {
    let badgeService =
      Components.classes["@instantbird.org/purple/nsdockbadgeservice;1"]
                .getService(Components.interfaces.nsIDockBadgeService);
    delete this.dockBadgeService;
    return this.dockBadgeService = badgeService;
  },
  showUnreadCount: function uck_showUnreadCount() {
    unreadCountKeeper._badgeTimeout = null;
    unreadCountKeeper.dockBadgeService.badgeText = unreadCountKeeper._unreadCount;
  },
  incrementUnreadCount: function uck_incrementUnreadCount() {
    this._unreadCount++;
    if (this._unreadCount == 1)
      this._badgeTimeout = setTimeout(this.showUnreadCount, 1000);
    else
      if (!this._badgeTimeout)
        this.showUnreadCount();
  },
  clearUnreadCount: function uck_clearUnreadCount() {
    unreadCountKeeper._unreadCount = 0;
    if (unreadCountKeeper._badgeTimeout) {
      clearTimeout(unreadCountKeeper._badgeTimeout);
      unreadCountKeeper._badgeTimeout = null;
    }
    else
      unreadCountKeeper.dockBadgeService.badgeText = "";
  },
  load: function uck_load() {
    window.addEventListener("focus", unreadCountKeeper.clearUnreadCount, false);
    window.addEventListener("unload", unreadCountKeeper.unload, false);
    Components.classes["@mozilla.org/observer-service;1"]
              .getService(Components.interfaces.nsIObserverService)
              .addObserver(unreadCountKeeper, "new-text", false);
  },
  unload: function uck_unload() {
    Components.classes["@mozilla.org/observer-service;1"]
              .getService(Components.interfaces.nsIObserverService)
              .removeObserver(unreadCountKeeper, "new-text");
  },
  observe: function uck_observe(aObject, aTopic, aData) {
    switch(aTopic) {
    case "new-text":
      aObject.QueryInterface(Ci.purpleIMessage);
      if (!document.hasFocus() && aObject.incoming && !aObject.system &&
          (!(aObject.conversation instanceof Ci.purpleIConvChat) ||
           aObject.containsNick))
        this.incrementUnreadCount();
      break;

    default:
      throw "Bad notification";
    }
  }
};

this.addEventListener("load", unreadCountKeeper.load, false);
