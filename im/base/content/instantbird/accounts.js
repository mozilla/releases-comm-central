// This is the list of notifications that the account manager window observes
const events = [
  "purple-quit",
  "account-added",
  "account-updated",
  "account-removed",
  "account-connected",
  "account-connecting",
  "account-disconnected",
  "account-disconnecting",
  "account-connect-progress",
  "account-connect-error"
];

var gAccountManager = {
  load: function am_load() {
    this.accountList = document.getElementById("accountlist");
    for (let acc in this.getAccounts()) {
      //dump(acc.id + ": " + acc.name + "\n");
      var elt = document.createElement("richlistitem");
      this.accountList.appendChild(elt);
      elt.build(acc);
    }
    addObservers(this, events);
    if (!this.accountList.getRowCount())
      // This is horrible, but it works. Otherwise (at least on mac)
      // the wizard is not centered relatively to the account manager
      setTimeout(function() { gAccountManager.new(); }, 0);
    else
      this.accountList.selectedIndex = 0;
    window.addEventListener("unload", this.unload, false);
  },
  unload: function am_unload() {
    removeObservers(gAccountManager, events);
  },
  observe: function am_observe(aObject, aTopic, aData) {
    if (aTopic == "purple-quit") {
      // libpurple is being uninitialized. We don't need the account
      // manager window anymore, close it.
      this.close();
      return;
    }

    if (!(aObject instanceof Ci.purpleIAccount))
      throw "Bad notification.";

    if (aTopic == "account-added") {
      dump("new account : " + aObject.id + ": " + aObject.name + "\n");
      var elt = document.createElement("richlistitem");
      this.accountList.appendChild(elt);
      elt.build(aObject);
      if (this.accountList.getRowCount() == 1)
	this.accountList.selectedIndex = 0;
    }
    else if (aTopic == "account-removed") {
      dump("deleting account : " + aObject.id + ": " + aObject.name + "\n");
      var elt = document.getElementById(aObject.id);
      if (!elt.selected) {
	this.accountList.removeChild(elt);
	return;
      }
      // The currently selected element is removed,
      // ensure another element gets selected (if the list is not empty)
      var selectedIndex = this.accountList.selectedIndex;
      this.accountList.removeChild(elt);
      var count = this.accountList.getRowCount();
      if (!count)
	return;
      if (selectedIndex == count)
	--selectedIndex;
      this.accountList.selectedIndex = selectedIndex;
      dump("new selected index : " + selectedIndex + "\n");
    }
    else if (aTopic == "account-updated") {
      var elt = document.getElementById(aObject.id);
      elt.build(aObject);
      return;
    }

    const stateEvents = {
      "account-connected": "connected",
      "account-connecting": "connecting",
      "account-disconnected": "disconnected",
      "account-disconnecting": "disconnecting"
    };
    var elt = document.getElementById(aObject.id);
    if (aTopic in stateEvents) {
      if (!elt) {
	/* The listitem associated with this account could not be
	found. This happens when the account is being deleted. The
	account-removed signal is fired before account-disconnecting
	and account-disconnected. Maybe we should add a readonly
	boolean attribute |deleting| to purpleIAccount? */
	return;
      }

      /* handle protocol icon animation while connecting */
      var icon = document.getAnonymousElementByAttribute(elt, "anonid", "prplicon");
      if (aTopic == "account-connecting") {
        icon.animate();
        elt.removeAttribute("error");
        aObject.connectionStateMsg = "";
        elt.updateConnectionState(false);
      }
      else
	icon.stop();

      elt.setAttribute("state", stateEvents[aTopic]);
    }
    else if (aTopic == "account-connect-progress") {
      elt.updateConnectionState(false);
    }    
    else if (aTopic == "account-connect-error") {
      elt.updateConnectionState(true);
    }    
  },
  connect: function am_connect() {
    this.accountList.selectedItem.connect();
  },
  disconnect: function am_disconnect() {
    this.accountList.selectedItem.disconnect();
  },
  delete: function am_delete() {
    this.accountList.selectedItem.delete();
  },
  new: function am_new() {
    this.openDialog("chrome://instantbird/content/accountWizard.xul");
  },
  edit: function am_edit() {
    this.openDialog("chrome://instantbird/content/account.xul",
                    this.accountList.selectedItem.account);
  },
  autologin: function am_autologin() {
    var elt = this.accountList.selectedItem;
    elt.autoLogin = !elt.autoLogin;
  },
  close: function am_close() {
    window.close();
  },

  selectAccount: function am_selectAccount(aAccountId) {
    this.accountList.selectedItem = document.getElementById(aAccountId);
    this.accountList.ensureSelectedElementIsVisible();
  },

  getAccounts: function am_getAccounts() {
    var pcs = Components.classes["@instantbird.org/purple/core;1"]
                        .getService(Ci.purpleICoreService);
    return getIter(pcs.getAccounts, Ci.purpleIAccount);
  },

  openDialog: function am_openDialog(aUrl, aArgs) {
    window.openDialog(aUrl, "",
                      "chrome,modal,titlebar,centerscreen",
                      aArgs);
  }
};
