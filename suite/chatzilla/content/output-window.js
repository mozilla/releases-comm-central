/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var initialized = false;

var view;
var client;
var mainWindow;
var clickHandler;

var dd;
var getMsg;
var getObjectDetails;

var header = null;
var headers = {
  IRCChannel: {
    prefix: "ch-",
    fields: ["container", "topicnodes", "topicinput", "topiccancel"],
    update: updateChannel,
  },

  IRCDCCFileTransfer: {
    prefix: "dcc-file-",
    fields: ["container", "file", "progress", "progressbar"],
    update: updateDCCFile,
  },
};

var initOutputWindow = function (newClient, newView, newClickHandler) {
  function initHeader() {
    /* it's better if we wait a half a second before poking at these
     * dom nodes. */
    if (view.TYPE in headers) {
      setHeaderState(view.prefs.displayHeader);
    }
    var div = document.getElementById("messages-outer");
    div.removeAttribute("hidden");
    window.scrollTo(0, window.document.body.clientHeight);
  }

  client = newClient;
  view = newView;
  clickHandler = newClickHandler;
  mainWindow = client.mainWindow;

  client.messageManager.importBundle(client.defaultBundle, window);

  getMsg = mainWindow.getMsg;
  getObjectDetails = mainWindow.getObjectDetails;
  dd = mainWindow.dd;

  if (view.TYPE in headers) {
    header = cacheNodes(headers[view.TYPE].prefix, headers[view.TYPE].fields);
    // Turn off accessibility announcements: they're useless as all these
    // changes are in the "log" as well, normally.
    // We're setting the attribute here instead of in the HTML to cope with
    // custom output windows and so we set it only on the Right header
    // for this view.
    header.container.setAttribute("aria-live", "off");
    header.update = headers[view.TYPE].update;
  }

  setTimeout(initHeader, 500);

  initialized = true;
}

function onTopicNodesClick(e) {
  if (!clickHandler(e)) {
    if (e.which != 1) {
      return;
    }

    startTopicEdit();
  }

  e.stopPropagation();
}

function onTopicKeypress(e) {
  switch (e.keyCode) {
    case 13 /* enter */:
      var topic = header.topicinput.value;
      topic = mainWindow.replaceColorCodes(topic);
      view.setTopic(topic);
      cancelTopicEdit(true);
      view.dispatch("focus-input");
      break;

    case 27 /* esc */:
      cancelTopicEdit(true);
      view.dispatch("focus-input");
      break;

    default:
      client.mainWindow.onInputKeyPress(e);
  }
}

function startTopicEdit() {
  var me = view.getUser(view.parent.me.unicodeName);
  if (
    !me ||
    (!view.mode.publicTopic && !me.isOp && !me.isHalfOp) ||
    !hasAttribute("topicinput", "hidden")
  ) {
    return;
  }

  header.topicinput.value = mainWindow.decodeColorCodes(view.topic);

  header.topicnodes.setAttribute("hidden", "true");
  header.topicinput.removeAttribute("hidden");
  header.topiccancel.removeAttribute("hidden");
  header.topicinput.focus();
  header.topicinput.selectionStart = 0;
}

function cancelTopicEdit(force) {
  var originalTopic = mainWindow.decodeColorCodes(view.topic);
  if (
    !hasAttribute("topicnodes", "hidden") ||
    (!force && header.topicinput.value != originalTopic)
  ) {
    return;
  }

  header.topicinput.setAttribute("hidden", "true");
  header.topiccancel.setAttribute("hidden", "true");
  header.topicnodes.removeAttribute("hidden");
}

function cacheNodes(pfx, ary, nodes) {
  if (!nodes) {
    nodes = {};
  }

  for (var i = 0; i < ary.length; ++i) {
    nodes[ary[i]] = document.getElementById(pfx + ary[i]);
  }

  return nodes;
}

function adoptNode(node) {
  return client.adoptNode(node, document);
}

function setText(field, text) {
  if (!header[field].firstChild) {
    header[field].appendChild(document.createTextNode(""));
  }

  if (typeof text != "string") {
    text = MSG_UNKNOWN;
  }

  header[field].firstChild.data = text;
}

function setAttribute(field, name, value) {
  if (!value) {
    value = "true";
  }

  header[field].setAttribute(name, value);
}

function removeAttribute(field, name) {
  header[field].removeAttribute(name);
}

function hasAttribute(field, name) {
  return header[field].hasAttribute(name);
}

function setHeaderState(state) {
  if (header) {
    if (state) {
      removeAttribute("container", "hidden");
      updateHeader();
    } else {
      setAttribute("container", "hidden");
    }
  }
}

function updateHeader() {
  document.title = view.getURL();

  if (!header || hasAttribute("container", "hidden")) {
    return;
  }

  for (var id in header) {
    if (id in view) {
      setText(id, view[id]);
    }
  }

  if (header.update) {
    header.update();
  }
}

function updateChannel() {
  if (header.topicnodes.firstChild) {
    header.topicnodes.firstChild.remove();
  }

  if (view.active) {
    if (view.topic) {
      var data = getObjectDetails(view);
      data.dontLogURLs = true;
      var mailto = client.prefs["munger.mailto"];
      client.munger.getRule(".mailto").enabled = mailto;
      var nodes = client.munger.munge(view.topic, null, data);
      client.munger.getRule(".mailto").enabled = false;
      header.topicnodes.appendChild(adoptNode(nodes));
    } else {
      setText("topicnodes", MSG_NONE);
    }
  } else {
    setText("topicnodes", MSG_UNKNOWN);
  }
}

function updateDCCFile() {
  var pcent = view.progress;

  setText("file", view.filename);
  setText(
    "progress",
    getMsg(MSG_DCCFILE_PROGRESS, [
      pcent,
      mainWindow.getSISize(view.position),
      mainWindow.getSISize(view.size),
      mainWindow.getSISpeed(view.speed),
    ])
  );

  setAttribute("progressbar", "width", pcent + "%");
}
