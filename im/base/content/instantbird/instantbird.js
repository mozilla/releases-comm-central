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

const events = ["new-text",
                "new-conversation",
                "purple-quit"];

var msgObserver = {
  convs: { },
  // Components.interfaces.nsIObserver
  observe: function mo_observe(aObject, aTopic, aData) {
    switch(aTopic) {
    case "purple-quit":
      for (let i in this.convs)
        this.convs[i].unInit();
      window.close();
      break;

    case "new-text":
      aObject.QueryInterface(Ci.purpleIMessage);
      var conv = aObject.conversation;
      var tab = this.convs[conv.id] || this.addConvTab(conv);
      if (!tab.loaded) // until we can load all messages from a conversation
        tab.addMsg(aObject);

      if (aObject.incoming && !aObject.system &&
          (!(aObject.conversation instanceof Ci.purpleIConvChat) ||
           aObject.containsNick))
        window.getAttention();
      break;

    case "new-conversation":
      aObject.QueryInterface(Ci.purpleIConversation);
      this.addConvTab(aObject);
      break;

    default:
      throw "Bad notification";
    }
  },

  addConvTab: function mo_addConvTab(aConv) {
    if (aConv.id in this.convs)
      return this.convs[aConv.id];

    var conv = document.createElement("conversation");
    var panels = document.getElementById("panels");
    panels.appendChild(conv);

    var tabs = document.getElementById("tabs");
    var tab = document.createElement("convtab");
    tab.tooltipText = aConv.name;
    let title = aConv.title
                     .replace(/^([a-zA-Z0-9.]+)[@\s].*/, "$1")
                     .replace(/(.{15}).*/, "$1...");
    tab.setAttribute("label", title);
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
      this.addConvTab(aConv);
      if (!(id in this.convs))
        throw "Can't find the conversation, even after trying to add it again!";
    }
    var panels = document.getElementById("panels");
    var conv = this.convs[id];
    panels.selectedPanel = conv;
    document.getElementById("tabs").selectedIndex = panels.selectedIndex;
    this.focusSelectedTab();
  },

  focusSelectedTab: function mo_focusSelectedTab() {
    this.focusTimeoutId = null;
    var tabs = document.getElementById("tabs");
    var tab = tabs.selectedItem;
    tab.removeAttribute("unread");
    tab.removeAttribute("attention");
    var panels = document.getElementById("panels");
    panels.selectedPanel.focus();
  },

  onSelectTab: function mo_onSelectTab() {
    if (this.focusTimeoutId)
      clearTimeout(this.focusTimeoutId);

#ifdef WINCE
    // work around the brokenness of tabpanels / display:-moz-deck on WinCE
    let panels = document.getElementById("panels");
    let selectedPanel = panels.selectedPanel;
    for (var panel = panels.firstChild; panel; panel = panel.nextSibling) {
      if (panel == selectedPanel)
        panel.setAttribute("selected", "true");
      else
        panel.removeAttribute("selected");
    } 
#endif

    this.focusTimeoutId = setTimeout(this.focusSelectedTab, 1000);
  },

  onClickTab: function mo_onClickTab(aEvent) {
    if (aEvent.target.localName != "convtab")
      return;

    if (aEvent.button == 1)
      this.closeTab(aEvent.target);

    if (aEvent.button == 0)
      this.focusSelectedTab();
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

    conv.conv.close(); //FIXME We shouldn't need this, why isn't the destructor
                       //      of the conversation binding called??

    if (aTab.selected) {
      if (aTab.nextSibling) {
        // we are not on the last tab
        aTab.parentNode.selectedItem = aTab.nextSibling;
        panels.selectedPanel = conv.nextSibling;
      }
      else {
        // we remove the last tab, which is selected
        if (aTab.previousSibling) {
          // at least a tab remain
          aTab.parentNode.selectedItem = aTab.previousSibling;
          panels.selectedPanel = conv.previousSibling;
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

  onMouseZoom: function mo_onMouseZoom(event) {
    if (!event.ctrlKey || event.altKey || event.shiftKey || !event.detail)
      return;

    var cmd = event.detail < 0 ? "cmd_textZoomEnlarge" : "cmd_textZoomReduce";
    document.getElementById(cmd).doCommand();
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
    window.addEventListener("DOMMouseScroll", msgObserver.onMouseZoom, false);
  },
  unload: function mo_unload() {
    removeObservers(msgObserver, events);
  }
};

function getBrowser()
{
  return document.getElementById("panels").selectedPanel.browser;
}

function setStatusText(aMsg)
{
  var status = document.getElementById("status");
  status.setAttribute("label", aMsg);
}

this.addEventListener("load", msgObserver.load, false);
