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
 * 2007.
 *
 * The Initial Developer of the Original Code is
 * Florian QUEZE <florian@instantbird.org>.
 * Portions created by the Initial Developer are Copyright (C) 2008
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Romain Bezut <romain@bezut.info>
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

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
const Cc = Components.classes;
const Ci = Components.interfaces;

function autoLoginHandler() { }

autoLoginHandler.prototype = {
  handle: function clh_handle(cmdLine) {
    if (cmdLine.handleFlag("preferences", false)) {
      var features = "chrome,titlebar,toolbar,centerscreen,dialog=no";
      var url = "chrome://instantbird/content/preferences/preferences.xul";
      Components.classes["@mozilla.org/embedcomp/window-watcher;1"]
                .getService(Components.interfaces.nsIWindowWatcher)
                .openWindow(null, url, "_blank", features, null);
      cmdLine.preventDefault = true;
    }

    if (!cmdLine.handleFlag("n", false))
      return;

    Components.classes["@instantbird.org/purple/core;1"]
              .getService(Ci.purpleICoreService)
              .autoLoginStatus = Ci.purpleICoreService.AUTOLOGIN_USER_DISABLED;
  },

  // 3 tabs here because there is a misalignment with only 2
  helpInfo: "  -n                 Disables auto-login.\n" +
            "  -preferences       Open only the preferences window.",

  classDescription: "AutoLogin Handler",
  classID: Components.ID("{9e5d5160-d61d-4d57-ae0d-81bee4380269}"),
  contractID: "@instantbird.org/autologin-handler;1",
  QueryInterface: XPCOMUtils.generateQI([Ci.nsICommandLineHandler])
};

const NSGetFactory = XPCOMUtils.generateNSGetFactory([autoLoginHandler]);
