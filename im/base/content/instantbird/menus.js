const addonManagerWindow = "chrome://mozapps/content/extensions/extensions.xul?type=extensions";
const accountManagerWindow = "chrome://instantbird/content/accounts.xul";
const blistWindow = "chrome://instantbird/content/blist.xul";
const addBuddyWindow = "chrome://instantbird/content/addbuddy.xul";
const aboutWindow = "chrome://instantbird/content/aboutDialog.xul";
const convWindow = "chrome://instantbird/content/instantbird.xul";

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

  addBuddy: function menu_addBuddy() {
    window.openDialog(addBuddyWindow, "",
                      "chrome,modal,titlebar,centerscreen");
  },

  getAway: function menu_getAway() {
    buddyList.getAway();
  }
};
