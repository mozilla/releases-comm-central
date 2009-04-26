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
 * Portions created by the Initial Developer are Copyright (C) 2007
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

const addonManagerWindow = "chrome://mozapps/content/extensions/extensions.xul?type=extensions";
const accountManagerWindow = "chrome://instantbird/content/accounts.xul";
const blistWindow = "chrome://instantbird/content/blist.xul";
const addBuddyWindow = "chrome://instantbird/content/addbuddy.xul";
const joinChatWindow = "chrome://instantbird/content/joinchat.xul";
const aboutWindow = "chrome://instantbird/content/aboutDialog.xul";
const convWindow = "chrome://instantbird/content/instantbird.xul";
const errorConsoleWindow = "chrome://global/content/console.xul";

var menus = {
  focus: function menu_focus(aWindowType) {
    var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                       .getService(Components.interfaces.nsIWindowMediator);
    var win = wm.getMostRecentWindow(aWindowType);
    if (win)
      win.focus();
    return win;
  },

  about: function menu_about() {
    if (!this.focus("Messenger:About"))
      window.open(aboutWindow, "About",
                  "chrome,resizable=no,minimizable=no,centerscreen");
  },

  accounts: function menu_accounts() {
    if (!this.focus("Messenger:Accounts"))
      window.open(accountManagerWindow, "Accounts",
                  "chrome,resizable");
  },

  addons: function menu_addons() {
    if (!this.focus("Extension:Manager"))
      window.open(addonManagerWindow, "Addons",
                  "chrome,menubar,extra-chrome,toolbar,dialog=no,resizable");
  },

  errors: function debug_errors() {
    if (!menus.focus("global:console"))
      window.open(errorConsoleWindow, "Errors",
                  "chrome,extrachrome,menubar,resizable,scrollbars,status,toolbar");
  },

  updates: function menu_updates() {
    Components.classes["@mozilla.org/updates/update-prompt;1"]
              .getService(Components.interfaces.nsIUpdatePrompt)
              .checkForUpdates();
  },

  addBuddy: function menu_addBuddy() {
    window.openDialog(addBuddyWindow, "",
                      "chrome,modal,titlebar,centerscreen");
  },

  joinChat: function menu_joinChat() {
    window.openDialog(joinChatWindow, "",
                      "chrome,modal,titlebar,centerscreen");
  },

  getAway: function menu_getAway() {
    buddyList.getAway();
  },

  toggleSounds: function menu_toggleSounds() {
    var checked = document.getElementById("soundsMenuItem")
                          .getAttribute("checked") == "true";
    this._prefBranch.setBoolPref(soundsPref, checked);
  },

  uninit: function menu_uninit() {
    menus._prefBranch.removeObserver(soundsPref, menus);
  },

  init: function menu_init() {
    var branch =  Components.classes["@mozilla.org/preferences-service;1"]
                            .getService(Ci.nsIPrefService)
                            .getBranch(optPrefBranch);
    branch.QueryInterface(Ci.nsIPrefBranch2);
    menus._prefBranch = branch;

    branch.addObserver(soundsPref, menus, false);
    var menuitem = document.getElementById("soundsMenuItem");
    if (branch.getBoolPref(soundsPref))
      menuitem.setAttribute("checked", "true");
    else
      menuitem.removeAttribute("checked");

    this.addEventListener("unload", menus.uninit, false);
  },

  observe: function menu_observe(aSubject, aTopic, aData) {
    if (aTopic != "nsPref:changed" || aData != soundsPref)
      return;

    var menuitem = document.getElementById("soundsMenuItem");
    if (this._prefBranch.getBoolPref(soundsPref))
      menuitem.setAttribute("checked", "true");
    else
      menuitem.removeAttribute("checked");
  }
};

this.addEventListener("load", menus.init, false);
