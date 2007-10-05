const events = ["new-text",
//              "new message",
                "new-conversation",
                "purple-quit"];

var msgObserver = {
  convs: { },
  // Components.interfaces.nsIObserver
  observe: function mo_observe(aObject, aTopic, aData) {
    if (aTopic == "purple-quit") {
      window.close();
      return;
    }

    if (aTopic == "new-text") {
      if (!(aObject instanceof Ci.purpleIMessage))
	throw "msgObserver.observe called without message";
     
      var conv = aObject.conversation;
      var time = aObject.time;
      var name = aObject.alias ||aObject.who;
      var pseudoClass = "pseudo";
      if (aObject.incoming)
	pseudoClass += " incoming";
      else
	if (aObject.outgoing)
	  pseudoClass += " outgoing";

      var txt = '<span class="date">' + time + '</span>'
            + ' <span class="' + pseudoClass + '">' + name  + ":</span> "
            + aObject.message.replace(/\n/g, "<br/>");

      var id = conv.id;
      var tab = this.convs[id] || this.addConvTab(conv, conv.name);
      tab.addTxt(txt);
      return;
    }

    if (!(aObject instanceof Ci.purpleIConversation))
      throw "msgObserver.observe called without conversation";

    if (aTopic == "new-conversation") {
      this.addConvTab(aObject, aObject.name);
      return;
    }

    /*
    if (aTopic == "new message") {
      setStatus(aTopic + " from " + aObject.name);
    }
    */
  },

  ensureTwoDigits: function mo_ensureTwoDigits(aNumber) {
    if (aNumber < 10)
      return "0" + aNumber;
    else
      return aNumber;
  },

  addConvTab: function mo_addConvTab(aConv, aTitle) {
    if (aConv.id in this.convs)
      return this.convs[aConv.id];

    var conv = document.createElement("conversation");
    var panels = document.getElementById("panels");
    panels.appendChild(conv);

    var tabs = document.getElementById("tabs");
    var tab = document.createElement("convtab");
    tab.setAttribute("label", aTitle);
    tabs.appendChild(tab);
    if (!tabs.selectedItem)
      tabs.selectedItem = tab;

    conv.conv = aConv;
    conv.tab = tab;
    this.convs[aConv.id] = conv;
    return conv;
  },

  focusConv: function mo_focusConv(aConv) {
    var id = aConv.id;
    if (!(id in this.convs)) {
      // We only support a single chat window ATM so we can safely
      // re-add a closed conversation tab
      this.addConvTab(aConv, aConv.name);
      if (!(id in this.convs))
        throw "Can't find the conversation, even after trying to add it again!";
    }
    var panels = document.getElementById("panels");
    var conv = this.convs[id];
    panels.selectedPanel = conv;
    document.getElementById("tabs").selectedIndex = panels.selectedIndex;
  },

  onSelectTab: function mo_onSelectTab() {
    var tabs = document.getElementById("tabs");
    var tab = tabs.selectedItem;
    tab.removeAttribute("unread");
    var panels = document.getElementById("panels");
    panels.selectedPanel.focus();
  },

  onClickTab: function mo_onClickTab(aEvent) {
    if (aEvent.button == 1 && aEvent.target.localName == "convtab")
      this.closeTab(aEvent.target);
  },

  closeCurrentTab: function mo_closeCurrentTab() {
    var tabs = document.getElementById("tabs");
    this.closeTab(tabs.selectedItem);
  },

  closeTab: function mo_closeTab(aTab) {
    var tabs = aTab.parentNode.childNodes;
    var i = aTab.parentNode.getIndexOfItem(aTab);
    if (i == -1)
      throw "Can't find the tab that should be closed";

    var panels = document.getElementById("panels");
    var conv = panels.childNodes[i];
    if (!conv)
      throw "Can't find the conversation associated with the tab.";
    delete this.convs[conv.convId];

    if (aTab.selected) {
      if (i) {
        // we are not on the first tab
        aTab.parentNode.selectedItem = aTab.previousSibling;
        panels.selectedPanel = conv.previousSibling;
      }
      else {
        // we remove the first tab, which is selected
        if (aTab.nextSibling) {
          // at least a tab remain
          aTab.parentNode.selectedItem = aTab.nextSibling;
          panels.selectedPanel = conv.nextSibling;
        }
        else {
          window.close();
        }
      }
    }

    panels.removeChild(conv);
    // Workaround an ugly bug: when removing a panel, the selected panel disappears
    panels.selectedPanel = panels.selectedPanel;

    aTab.parentNode.removeChild(aTab);
  },

  onPopupShowing: function mo_onPopupShowing(aEvent) {
    if (aEvent.explicitOriginalTarget.localName == "convtab")
      this.contextTab = aEvent.explicitOriginalTarget;
    else
      aEvent.preventDefault();
  },

  onCommandClose: function mo_onCommandClose(aEvent) {
    this.closeTab(this.contextTab);
  },

  load: function mo_load() {
    addObservers(msgObserver, events);
    if (window.pendingNotifications) {
      let notifications = window.pendingNotifications;
      for (let i = 0; i < notifications.length; ++i) {
        let notif = notifications[i];
        msgObserver.observe(notif.object, notif.topic, notif.msg);
      }
      delete window.pendingNotifications;
    }
    window.addEventListener("unload", msgObserver.unload, false);
  },
  unload: function mo_unload() {
    removeObservers(msgObserver, events);
  }
};

/*
function setStatus(aMsg)
{
  var status = document.getElementById("status");
  status.setAttribute("label", aMsg);
}
*/

this.addEventListener("load", msgObserver.load, false);
