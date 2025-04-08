/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function initMenus() {
  function onMenuCommand(event, window) {
    var commandName = event.originalTarget.getAttribute("commandname");
    var params = {};
    if ("cx" in client.menuManager && client.menuManager.cx) {
      params = client.menuManager.cx;
    }
    params.sourceWindow = window;
    params.source = "menu";
    params.shiftKey = event.shiftKey;

    dispatch(commandName, params, true);

    delete client.menuManager.cx;
  }

  client.onMenuCommand = onMenuCommand;
  client.menuSpecs = {};
  var menuManager = new MenuManager(
    client.commandManager,
    client.menuSpecs,
    getCommandContext,
    "client.onMenuCommand(event, window);"
  );
  client.menuManager = menuManager;

  // IRC specific values
  var ViewChannel = "(cx.TYPE == 'IRCChannel')";
  var ViewDCC = "(cx.TYPE.startsWith('IRCDCC'))";

  // IRC specific combinations
  var ChannelActive = "(" + ViewChannel + " and cx.channel.active)";
  var ChannelInactive = "(" + ViewChannel + " and !cx.channel.active)";
  var DCCActive = "(" + ViewDCC + " and cx.sourceObject.isActive())";
  var NetConnected = "(cx.network and cx.network.isConnected())";
  var NetDisconnected = "(cx.network and !cx.network.isConnected())";

  // Me is op.
  var isop = "(cx.channel.iAmOp()) && ";
  // Me is op or half-op.
  var isopish = "(cx.channel.iAmOp() || cx.channel.iAmHalfOp()) && ";
  // Server has half-ops.
  var shop = "cx.server.supports.prefix.includes('h', 1) && ";
  // User is Me or Me is op.
  var isoporme = "((cx.user == cx.server.me) || cx.channel.iAmOp()) && ";

  client.menuSpecs["popup:opcommands"] = {
    label: MSG_MNU_OPCOMMANDS,
    accesskey: getAccessKeyForMenu("MSG_MNU_OPCOMMANDS"),
    items: [
      ["op", { visibleif: isop + "!cx.user.isOp" }],
      ["deop", { visibleif: isop + "cx.user.isOp" }],
      ["hop", { visibleif: isop + "!cx.user.isHalfOp" }],
      ["dehop", { visibleif: isoporme + "cx.user.isHalfOp" }],
      ["voice", { visibleif: isopish + "!cx.user.isVoice" }],
      ["devoice", { visibleif: isopish + "cx.user.isVoice" }],
      ["-"],
      [
        "ban",
        { enabledif: "(" + isop + "1) || (" + isopish + "!cx.user.isOp)" },
      ],
      [
        "unban",
        { enabledif: "(" + isop + "1) || (" + isopish + "!cx.user.isOp)" },
      ],
      [
        "kick",
        { enabledif: "(" + isop + "1) || (" + isopish + "!cx.user.isOp)" },
      ],
      [
        "kick-ban",
        { enabledif: "(" + isop + "1) || (" + isopish + "!cx.user.isOp)" },
      ],
    ],
  };

  client.menuSpecs["popup:usercommands"] = {
    label: MSG_MNU_USERCOMMANDS,
    accesskey: getAccessKeyForMenu("MSG_MNU_USERCOMMANDS"),
    items: [
      ["query", { visibleif: "cx.channel && cx.user" }],
      ["whois", { visibleif: "cx.user" }],
      ["whowas", { visibleif: "cx.nickname && !cx.user" }],
      ["ping", { visibleif: "cx.user" }],
      ["time", { visibleif: "cx.user" }],
      ["version", { visibleif: "cx.user" }],
      ["-", { visibleif: "cx.user" }],
      ["dcc-chat", { visibleif: "cx.user" }],
      ["dcc-send", { visibleif: "cx.user" }],
    ],
  };

  client.menuSpecs["context:userlist"] = {
    getContext: getUserlistContext,
    items: [
      [
        "toggle-usort",
        { type: "checkbox", checkedif: "client.prefs['sortUsersByMode']" },
      ],
      [
        "toggle-umode",
        { type: "checkbox", checkedif: "client.prefs['showModeSymbols']" },
      ],
      ["-", { visibleif: "cx.nickname" }],
      [
        "label-user",
        { visibleif: "cx.nickname && (cx.userCount == 1)", header: true },
      ],
      [
        "label-user-multi",
        { visibleif: "cx.nickname && (cx.userCount != 1)", header: true },
      ],
      [
        ">popup:opcommands",
        { visibleif: "cx.nickname", enabledif: isopish + "true" },
      ],
      [
        ">popup:usercommands",
        { visibleif: "cx.nickname", enabledif: "cx.userCount == 1" },
      ],
    ],
  };

  var urlenabled = "has('url')";
  var urlexternal = "has('url') && cx.url.search(/^ircs?:/i) == -1";
  var textselected = "getCommandEnabled('cmd_copy')";

  client.menuSpecs["context:messages"] = {
    getContext: getMessagesContext,
    items: [
      ["goto-url", { visibleif: urlenabled }],
      ["goto-url-newwin", { visibleif: urlexternal }],
      ["goto-url-newtab", { visibleif: urlexternal }],
      ["cmd-copy-link-url", { visibleif: urlenabled }],
      ["cmd-copy", { visibleif: "!" + urlenabled, enabledif: textselected }],
      ["cmd-selectall", { visibleif: "!" + urlenabled }],
      ["websearch", { visibleif: textselected }],
      ["-", { visibleif: "cx.nickname" }],
      ["label-user", { visibleif: "cx.nickname", header: true }],
      [
        ">popup:opcommands",
        {
          visibleif: "cx.channel && cx.nickname",
          enabledif: isopish + "cx.user",
        },
      ],
      [">popup:usercommands", { visibleif: "cx.nickname" }],
      ["-"],
      ["clear-view"],
      ["hide-view", { enabledif: "client.viewsArray.length > 1" }],
      [
        "toggle-oas",
        {
          type: "checkbox",
          checkedif: "isStartupURL(cx.sourceObject.getURL())",
        },
      ],
      ["-"],
      ["leave", { visibleif: ChannelActive }],
      ["rejoin", { visibleif: ChannelInactive }],
      ["dcc-close", { visibleif: DCCActive }],
      [
        "delete-view",
        { visibleif: "!" + ChannelActive + " and !" + DCCActive },
      ],
      ["disconnect", { visibleif: NetConnected }],
      ["reconnect", { visibleif: NetDisconnected }],
      ["-"],
      ["toggle-text-dir"],
    ],
  };

  client.menuSpecs["context:tab"] = {
    getContext: getTabContext,
    items: [
      ["clear-view"],
      ["hide-view", { enabledif: "client.viewsArray.length > 1" }],
      [
        "toggle-oas",
        {
          type: "checkbox",
          checkedif: "isStartupURL(cx.sourceObject.getURL())",
        },
      ],
      ["-"],
      ["leave", { visibleif: ChannelActive }],
      ["rejoin", { visibleif: ChannelInactive }],
      ["dcc-close", { visibleif: DCCActive }],
      [
        "delete-view",
        { visibleif: "!" + ChannelActive + " and !" + DCCActive },
      ],
      ["disconnect", { visibleif: NetConnected }],
      ["reconnect", { visibleif: NetDisconnected }],
      ["-"],
      ["rename"],
      ["-"],
      ["toggle-text-dir"],
    ],
  };
}

function createMenus() {
  client.menuManager.createMenus(document, "mainmenu");
  client.menuManager.createContextMenus(document);
}

function getCommandContext(id, event) {
  var cx = { originalEvent: event };

  if (id in client.menuSpecs) {
    if ("getContext" in client.menuSpecs[id]) {
      cx = client.menuSpecs[id].getContext(cx);
    } else if ("cx" in client.menuManager) {
      //dd ("using existing context");
      cx = client.menuManager.cx;
    } else {
      //no context.
    }
  } else {
    dd("getCommandContext: unknown menu id " + id);
  }

  if (typeof cx == "object") {
    if (!("menuManager" in cx)) {
      cx.menuManager = client.menuManager;
    }
    if (!("contextSource" in cx)) {
      cx.contextSource = id;
    }
    if ("dbgContexts" in client && client.dbgContexts) {
      dd("context '" + id + "'\n" + dumpObjectTree(cx));
    }
  }

  return cx;
}

/**
 * Gets an accesskey for the menu with label string ID labelString.
 * At first, we attempt to extract it from the label string, otherwise
 * we fall back to using a separate string.
 *
 * @param labelString   the id for the locale string corresponding to the label
 * @return              the accesskey for the menu.
 */
function getAccessKeyForMenu(labelString) {
  var rv = getAccessKey(window[labelString]);
  if (!rv) {
    rv = window[labelString + "_ACCESSKEY"] || "";
  }
  return rv;
}

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
