/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var gContextMenu;

function setLabel(id, strId, ary, key) {
  let item = document.getElementById(id);
  let stringId = strId || id;
  item.label = ary
    ? client.bundle.getFormattedString(stringId, ary)
    : client.bundle.getString(stringId);
  if (key) {
    item.accessKey = client.bundle.getString(stringId + ".accesskey");
  }
}

function setAttr(id, attr, cond) {
  let item = document.getElementById(id);
  if (cond) {
    item.setAttribute(attr, "true");
  } else {
    item.removeAttribute(attr);
  }
}

function initChatZillaMenu() {
  let cx = getDefaultContext();
  setLabel("openAtStartup", "", [cx.viewType], true);
  setLabel("leaveChannel", "", [cx.channelName], true);
  setLabel("rejoinChannel", "", [cx.channelName], true);
  setLabel("dccClose", "", [cx.channelName], true);
  setLabel("disconnectNet", "", [cx.networkName], true);
  setLabel("reconnectNet", "", [cx.networkName], true);

  let ViewChannel = cx.TYPE == "IRCChannel";
  let ChannelActive = ViewChannel && cx.channel.active;
  let ChannelInactive = ViewChannel && !cx.channel.active;
  let DCCActive = cx.TYPE.startsWith("IRCDCC") && cx.sourceObject.isActive();
  let NetConnected = cx.network && cx.network.isConnected();
  let NetDisconnected = cx.network && !cx.network.isConnected();
  setAttr("openAtStartup", "checked", isStartupURL(cx.sourceObject.getURL()));
  setAttr("leaveChannel", "hidden", !ChannelActive);
  setAttr("rejoinChannel", "hidden", !ChannelInactive);
  setAttr("dccClose", "hidden", !DCCActive);
  setAttr("closeCZTab", "hidden", ChannelActive || DCCActive);
  setAttr("disconnectNet", "hidden", !NetConnected);
  setAttr("disconnectAll", "hidden", !NetConnected);
  setAttr("reconnectNet", "hidden", !NetDisconnected);
  setAttr("reconnectAll", "hidden", !NetDisconnected);
}

function initAwayMsgs(menuPopup) {
  let cx = getDefaultContext();
  let away = cx.network ? cx.network.prefs.away : client.prefs.away;

  let awayArray = client.awayMsgs;
  let awayCount = awayArray.length;

  // Remove any existing non-static entries.
  let menuseparator = menuPopup.lastChild.previousSibling;
  for (let i = menuPopup.childNodes.length; i > 5; --i) {
    menuseparator.previousSibling.remove();
  }

  let back = true;
  let backItem = menuseparator.previousSibling;

  // Now rebuild the list.
  for (let i = 0; i < awayCount; ++i) {
    let item = awayArray[i];
    let newMenuItem = document.createElement("menuitem");
    let awayMsg = client.bundle.getFormattedString("awayMsg", [item.message]);
    newMenuItem.setAttribute("label", awayMsg);
    newMenuItem.setAttribute("value", item.message);
    newMenuItem.setAttribute("type", "radio");
    if (item.message == away) {
      newMenuItem.setAttribute("checked", true);
      back = false;
    }
    newMenuItem.setAttribute("oncommand", "toggleAwayMsg(event);");
    menuPopup.insertBefore(newMenuItem, menuseparator);
  }

  if (back) {
    backItem.setAttribute("checked", true);
  }
}

function initViewMenu() {
  let cx = getDefaultContext();
  setAttr("hide-view", "disabled", client.viewsArray.length < 2);
  setAttr("toggleCCM", "checked", client.prefs.collapseMsgs);
  setAttr("toggleCopy", "checked", client.prefs.copyMessages);
  setAttr("showTimestamps", "checked", cx.sourceObject.prefs.timestamps);
}

function initViewsPopup(menuPopup) {
  function addView(view) {
    // We only need the view to have messages, so we accept hidden views.
    if (!("messages" in view)) {
      return;
    }

    let url = view.getURL();
    if (url in urls) {
      return;
    }

    let label = view.viewName;
    if (!getTabForObject(view)) {
      label = client.bundle.getFormattedString("viewHidden", [label]);
    }

    let types = ["IRCClient", "IRCNetwork", "IRCDCCChat", "IRCDCCFileTransfer"];
    let typesNetwork = ["IRCNetwork", "IRCChannel", "IRCUser"];
    let group = String(types.indexOf(view.TYPE));
    if (typesNetwork.includes(view.TYPE)) {
      group = "1-" + getObjectDetails(view).network.viewName;
    }

    let sort = group;
    if (view.TYPE != "IRCNetwork") {
      sort += "-" + view.viewName;
    }

    viewsArray.push({ url, label, group, sort });
    urls[url] = true;
  }

  function sortViews(a, b) {
    if (a.sort < b.sort) {
      return -1;
    }
    if (a.sort > b.sort) {
      return 1;
    }
    return 0;
  }

  let viewsArray = [];
  let urls = {};

  /* XXX The code here works its way through all the open views *and* any
   * possibly visible objects in the object model. This is necessary because
   * occasionally objects get removed from the object model while still
   * having a view open. See bug 459318 for one such case. Note that we
   * won't be able to correctly switch to the "lost" view but showing it is
   * less confusing than not.
   */

  for (let view of client.viewsArray) {
    addView(view.source);
  }

  addView(client);
  for (let n in client.networks) {
    addView(client.networks[n]);
    for (let s in client.networks[n].servers) {
      let server = client.networks[n].servers[s];
      for (let c in server.channels) {
        addView(server.channels[c]);
      }
      for (let u in server.users) {
        addView(server.users[u]);
      }
    }
  }

  for (let u in client.dcc.users) {
    addView(client.dcc.users[u]);
  }
  for (let chat of client.dcc.chats) {
    addView(chat);
  }
  for (let file of client.dcc.files) {
    addView(file);
  }

  viewsArray.sort(sortViews);

  // Remove any existing entries.
  while (menuPopup.childNodes.length > 0) {
    menuPopup.removeChild(menuPopup.lastChild);
  }

  let url = client.currentObject.getURL();
  let viewsCount = viewsArray.length;
  let lastGroup = "";

  // Now rebuild the list.
  for (let i = 0; i < viewsCount; ++i) {
    let item = viewsArray[i];
    if (i > 0 && item.group != lastGroup) {
      menuPopup.appendChild(document.createElement("menuseparator"));
    }

    let newMenuItem = document.createElement("menuitem");
    newMenuItem.setAttribute("label", item.label);
    newMenuItem.setAttribute("value", item.url);
    newMenuItem.setAttribute("type", "radio");
    if (item.url == url) {
      newMenuItem.setAttribute("checked", true);
    }

    newMenuItem.setAttribute("oncommand", "gotoView(this.value);");
    menuPopup.appendChild(newMenuItem);

    lastGroup = item.group;
  }
}

function initToolbarsPopup() {
  function isVisible(id) {
    let item = document.getElementById(id);
    return item.getAttribute("collapsed") != "true";
  }
  let cx = getDefaultContext();
  setAttr("showTabstrip", "checked", isVisible("view-tabs"));
  setAttr("showHeader", "checked", cx.sourceObject.prefs.displayHeader);
  setAttr("showUserlist", "checked", isVisible("user-list-box"));
  setAttr("showStatusbar", "checked", isVisible("status-bar"));
}

function initMotifsPopup() {
  function isMotif(name) {
    return client.prefs["motif.current"] == client.prefs["motif." + name];
  }
  setAttr("motif-dark", "checked", isMotif("dark"));
  setAttr("motif-light", "checked", isMotif("light"));
}

function initFontFamilyPopup() {
  let family = client.currentObject.prefs["font.family"];
  setAttr("fontDefault", "checked", family == "default");
  setAttr("fontSerif", "checked", family == "serif");
  setAttr("fontSansSerif", "checked", family == "sans-serif");
  setAttr("fontMonospace", "checked", family == "monospace");
  let custom = !family.match(/^(default|(sans-)?serif|monospace)$/);
  setAttr("fontFamilyOther", "checked", custom);
  if (custom) {
    setLabel("fontFamilyOther", "", [family]);
  }
}

function initFontSizePopup() {
  let size = client.prefs["font.size"];
  if (size == 0) {
    size = null;
  }
  let defaultSize = getDefaultFontSize();
  // It's "custom" if it's set (non-zero/not default), not the default
  // size (medium) and not +/-2 (small/large).
  let custom = size && size != defaultSize && Math.abs(size - defaultSize) != 2;
  setAttr("fontSizeDefault", "checked", !size);
  setAttr("fontSizeSmall", "checked", size == defaultSize - 2);
  setAttr("fontSizeMedium", "checked", size == defaultSize);
  setAttr("fontSizeLarge", "checked", size == defaultSize + 2);
  setAttr("fontSizeOther", "checked", custom);
  if (custom) {
    setLabel("fontSizeOther", "", [size]);
  }
}

function cZContextMenuShowing(aTarget, aEvent) {
  function getUserlistContext() {
    let cx = {};
    cx.__proto__ = getObjectDetails(client.currentObject);
    if (!cx.channel) {
      return cx;
    }

    cx.nicknameList = [];

    // Loop through the selection.
    for (let item of client.list.selectedItems) {
      cx.nicknameList.push(getNicknameForUserlistRow(item));
    }

    cx.userList = [];
    cx.canonNickList = [];

    for (let i = 0; i < cx.nicknameList.length; ++i) {
      let user = cx.channel.getUser(cx.nicknameList[i]);
      cx.userList.push(user);
      cx.canonNickList.push(user.canonicalName);
      if (i == 0) {
        cx.user = user;
        cx.nickname = user.unicodeName;
        cx.canonNick = user.canonicalName;
      }
    }
    cx.userCount = cx.userList.length;

    return cx;
  }

  function getTabContext() {
    let cx = {};
    let element = document.popupNode;

    while (element) {
      if (element.localName == "tab") {
        cx.__proto__ = getObjectDetails(element.view);
        return cx;
      }
      element = element.parentNode;
    }

    return cx;
  }

  // If the popupshowing was for a submenu, we don't need to do anything.
  if (aEvent.target != aTarget) {
    return true;
  }

  gContextMenu = new nsContextMenu(aTarget, aEvent.shiftKey, aEvent);
  let eventParent = aEvent.rangeParent;
  let isList = eventParent && eventParent.id == "user-list";
  let isTab = eventParent && eventParent.id == "views-tbar-inner";
  let cx;
  if (isList) {
    cx = getUserlistContext();
  } else if (isTab) {
    cx = getTabContext();
  } else {
    cx = getMessagesContext();
  }
  gContextMenu.cx = cx;
  let urlenabled = gContextMenu.onLink;
  let urlexternal = urlenabled && !gContextMenu.linkProtocol.startsWith("irc");
  let isopish = cx.channel && (cx.channel.iAmOp() || cx.channel.iAmHalfOp());
  let ViewChannel = cx.TYPE == "IRCChannel";
  let ChannelActive = ViewChannel && cx.channel.active;
  let ChannelInactive = ViewChannel && !cx.channel.active;
  let DCCActive = cx.TYPE.startsWith("IRCDCC") && cx.sourceObject.isActive();
  let NetConnected = cx.network && cx.network.isConnected();
  let NetDisconnected = cx.network && !cx.network.isConnected();
  setAttr("context-goto-url", "hidden", !urlenabled);
  setAttr("context-goto-url-newtab", "hidden", !urlexternal);
  setAttr("context-goto-url-newwin", "hidden", !urlexternal);
  setAttr("context-copy-link", "hidden", !urlenabled);
  setAttr("context-toggle-usort", "hidden", !isList);
  setAttr("context-toggle-usort", "checked", client.prefs.sortUsersByMode);
  setAttr("context-toggle-umode", "hidden", !isList);
  setAttr("context-toggle-umode", "checked", client.prefs.showModeSymbols);
  setAttr("context-toggle-separator", "hidden", !isList);
  setAttr("context-copy", "hidden", urlenabled || isTab || isList);
  setAttr("context-selectall", "hidden", urlenabled || isTab);
  if (isList || isTab) {
    setAttr("context-searchselect", "hidden", true);
  }
  setAttr("context-nickname-separator", "hidden", !cx.nickname);
  setAttr("context-label-user", "hidden", !cx.nickname);
  setAttr("context-label-user", "header", true);
  setAttr("context-op-commands", "hidden", !cx.channel || !cx.nickname);
  setAttr("context-op-commands", "disabled", !isopish || !cx.user);
  setAttr("context-user-commands", "hidden", !cx.nickname);
  setAttr("context-tab-separator", "hidden", !isTab);
  setAttr("context-tab-clear", "hidden", !isTab);
  setAttr("context-tab-hide", "hidden", !isTab);
  setAttr("context-tab-hide", "disabled", client.viewsArray.length < 2);
  setAttr("context-toggle-oas", "hidden", !isTab);
  setAttr(
    "context-toggle-oas",
    "checked",
    isTab && isStartupURL(cx.sourceObject.getURL())
  );
  setAttr("context-channel-leave", "hidden", !ChannelActive || !isTab);
  setAttr("context-channel-rejoin", "hidden", !ChannelInactive || !isTab);
  setAttr("context-dcc-close", "hidden", !DCCActive || !isTab);
  setAttr("context-tab-close", "hidden", ChannelActive || DCCActive || !isTab);
  setAttr("context-net-disconnect", "hidden", !NetConnected || !isTab);
  setAttr("context-net-reconnect", "hidden", !NetDisconnected || !isTab);
  setAttr("context-rename-separator", "hidden", !isTab);
  setAttr("context-tab-rename", "hidden", !isTab);
  setAttr("context-text-separator", "hidden", !isTab);
  setAttr("context-toggle-text-dir", "hidden", isList);
  if (cx.nickname) {
    let userCount = isList ? cx.userCount : 1;
    if (userCount > 1) {
      setLabel("context-label-user", "usersLabel", [userCount]);
    } else if (userCount == 1) {
      setLabel("context-label-user", "userLabel", [cx.nickname]);
    } else {
      setLabel("context-label-user", "msg.unknown");
    }
  }
  if (isTab && cx.viewType) {
    setLabel("context-toggle-oas", "openAtStartup", [cx.viewType], true);
  }
  if (isTab && cx.channelName) {
    setLabel("context-channel-leave", "leaveChannel", [cx.channelName], true);
    setLabel("context-channel-rejoin", "rejoinChannel", [cx.channelName], true);
  }
  if (isTab && DCCActive && cx.userName) {
    setLabel("context-dcc-close", "dccClose", [cx.userName], true);
  }
  if (isTab && cx.networkName) {
    setLabel("context-net-disconnect", "disconnectNet", [cx.networkName], true);
    setLabel("context-net-reconnect", "reconnectNet", [cx.networkName], true);
  }

  return gContextMenu.shouldDisplay || isList || isTab;
}

function cZContextMenuHiding(aTarget, aEvent) {
  // Don't do anything if it's a submenu's onpopuphiding that's just bubbling
  // up to the top.
  if (aEvent.target != aTarget) {
    return;
  }

  gContextMenu.hiding();
  gContextMenu = null;
}

function initOpCommandsPopup(cx) {
  // Me is op.
  let isop = cx.channel.iAmOp();
  // User is Me or Me is op.
  let isoporme = cx.user == cx.server.me || isop;
  // Me is op or half-op.
  let isopish = isop || cx.channel.iAmHalfOp();
  setAttr("context-user-op", "hidden", !isop);
  if (isop) {
    setAttr("context-user-op", "checked", cx.user.isOp);
  }
  setAttr("context-user-hop", "hidden", !isoporme);
  if (isoporme) {
    setAttr("context-user-hop", "checked", cx.user.isHalfOp);
  }
  setAttr("context-user-voice", "hidden", !isopish);
  if (isopish) {
    setAttr("context-user-voice", "checked", cx.user.isVoice);
  }
  let kickban = isop || (isopish && !cx.user.isOp);
  setAttr("context-user-ban", "disabled", !kickban);
  setAttr("context-user-unban", "disabled", !kickban);
  setAttr("context-user-kick", "disabled", !kickban);
  setAttr("context-user-kick-ban", "disabled", !kickban);
  setLabel("context-user-ban", "userBan", [cx.channelName], true);
  setLabel("context-user-unban", "userUnban", [cx.channelName], true);
  setLabel("context-user-kick", "userKick", [cx.channelName], true);
  setLabel("context-user-kick-ban", "userKickBan", [cx.channelName], true);
}

function initUserCommandsPopup(cx) {
  setAttr("context-user-query", "hidden", !cx.channel || !cx.user);
  setAttr("context-user-whois", "hidden", !cx.user);
  setAttr("context-user-whowas", "hidden", !cx.nickname || cx.user);
  setAttr("context-user-ping", "hidden", !cx.user);
  setAttr("context-user-time", "hidden", !cx.user);
  setAttr("context-user-version", "hidden", !cx.user);
  setAttr("context-dcc-separator", "hidden", !cx.user);
  setAttr("context-dcc-chat", "hidden", !cx.user);
  setAttr("context-dcc-send", "hidden", !cx.user);
}
