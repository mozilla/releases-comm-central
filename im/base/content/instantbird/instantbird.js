// For Venkman

function toOpenWindowByType(inType, uri) {
  var winopts = "chrome,extrachrome,menubar,resizable,scrollbars,status,toolbar";
  window.open(uri, "_blank", winopts);
}

// End { For Venkman }

const Ci = Components.interfaces;
const Cc = Components.classes;

var msgObserver = {
  // Components.interfaces.nsIObserver
  observe: function(aObject, aTopic, aData)
  {
    var conv;
    if (aObject instanceof Components.interfaces.purpleIConversation)
      conv = aObject;

    if (aTopic == "new text") {
      if (conv) {
        var date = new Date();
        var time = ensureTwoDigits(date.getHours()) + ':'
                 + ensureTwoDigits(date.getMinutes()) + ':'
                 + ensureTwoDigits(date.getSeconds());
        aData = '<span class="date">(' + time + ')</span>'
              + ' <span class="pseudo">' + conv.name + ":</span> " + aData;
      }

      var browser = document.getElementById("browser");
      var doc = browser.contentDocument;
      var elt = doc.getElementById("ibcontent");
      var newElt = doc.createElement("p");
      newElt.innerHTML = aData;
      elt.appendChild(newElt);
      newElt.scrollIntoView(true);
    }
    else if (aTopic == "new message") {
      setStatus(aTopic + " from " + conv.name);
      //setTimeout(conv.sendMsg, 1, "Message received");
    }


/*
    var pcs = Components.classes["@instantbird.org/purple/core;1"]
                        .getService(Components.interfaces.purpleICoreService);
    dump("conversation array length: " + pcs.conversations.length);
    for (var i in pcs.conversations)
      dump(i + "=" + pcs.conversations[i]);
    dump("type : " + typeof conv + "test: "+ (conv instanceof Components.interfaces.purpleIConversation));
    dump("title = " + conv.title + " name = " + conv.name + " id = " + conv.idConv);
*/
  }
}

function setStatus(aMsg)
{
  var status = document.getElementById("status");
  status.setAttribute("label", aMsg);
}

function ensureTwoDigits(aNumber)
{
  if (aNumber < 10)
    return "0" + aNumber;
  else
    return aNumber;
}

function initEditor()
{
  var editor = document.getElementById("editor");
  editor.contentDocument.designMode = "on";
  setTimeout(function() { editor.contentWindow.focus(); }, 100);
}

function editorDoCommand(aCmd, aHtml)
{
  var editor = document.getElementById("editor");
  editor.contentDocument.execCommand(aCmd, false, aHtml);
}

function debug_enumerateProtocols()
{
  dump("trying to enumerate protocols:\n");
  var protocols = obj.getProtocols();
  while (protocols.hasMoreElements()) {
    var proto = protocols.getNext()
                         .QueryInterface(Ci.purpleIProtocol);
    dump(" " + proto.name + " " + proto.id + "\n");
    var opts = proto.getOptions();
    while (opts.hasMoreElements()) {
      var opt = opts.getNext()
                    .QueryInterface(Ci.purpleIPref);
      var type = { };
      type[opt.typeBool] = ["bool", opt.getBool];
      type[opt.typeInt] = ["int", opt.getInt];
      type[opt.typeString] = ["string", opt.getString];
      try {
	dump("  ("+ type[opt.type][0] + ") "  +
	     opt.name + (opt.masked ? "(masked)" : "") + "\t" +
	     type[opt.type][1]() + "\n");
      }
      catch (e) {
	dump("  (empty "+ type[opt.type][0] + ") "  +
	     opt.name + (opt.masked ? "(masked)" : "") + "\n")
      }
    }
  }
}

function debug_connectAccount(aProto, aName, aPassword)
{
  var pcs = Components.classes["@instantbird.org/purple/core;1"]
                      .getService(Ci.purpleICoreService);

  var proto = pcs.getProtocolById(aProto);
  if (!proto)
    throw "Couldn't get protocol " + aProto;

  var acc = pcs.createAccount(aName, proto);
  acc.password = aPassword;
  dump("trying to connect to " + proto.name +
       " (" + proto.id + ") with " + aName + "\n");
  acc.connect();
}

function initPurpleCore()
{
  try {
    var obj = Components.classes["@instantbird.org/purple/core;1"]
                        .getService(Components.interfaces.purpleICoreService);
    setStatus("libpurple version " + obj.version + " loaded!");
    obj.init();
    var ObserverService = Components.classes["@mozilla.org/observer-service;1"]
                                    .getService(Components.interfaces.nsIObserverService);
    ObserverService.addObserver(msgObserver, "new message", false);
    ObserverService.addObserver(msgObserver, "new text", false);

    debug_connectAccount("prpl-irc", "instantbirdtest@irc.freenode.net", "");
  }
  catch (e) {
    alert(e);
  }

  this.addEventListener("unload", uninitPurpleCore, false);

  document.getElementById("input").addEventListener("keypress", onSendMsg, false);
  document.getElementById("editor").addEventListener("keypress", onSendHTMLMsg, false);
  initEditor();

}

function sendMsg(aMsg)
{
  var pcs = Components.classes["@instantbird.org/purple/core;1"]
                      .getService(Components.interfaces.purpleICoreService);
  var convs = pcs.conversations;
  if (convs.length < 1)
    return false;

  var conv = convs.queryElementAt(convs.length - 1, Components.interfaces.purpleIConversation);
  conv.sendMsg(aMsg);
  return true;
}

function onSendMsg(event)
{
  if (event.keyCode != 13)
    return;

  var input = document.getElementById("input");
  if (!event.ctrlKey && !event.shiftKey && !event.altKey) {
    if (sendMsg(input.value))
      input.value = "";
    event.preventDefault();
  }
  else
    if (!event.shiftKey)
      input.value += "\n";
}

function onSendHTMLMsg(event)
{
  if (event.keyCode != 13)
    return;

  var editorElt = document.getElementById("editor")
  var editor = editorElt.getEditor(editorElt.contentWindow);
  var docRoot = editor.rootElement;

  if (!event.ctrlKey && !event.shiftKey && !event.altKey) {
    if (sendMsg(docRoot.innerHTML))
      docRoot.innerHTML = "";
    event.preventDefault();
  }
  else {
    if (!event.shiftKey)
      // unfortunately, this doesn't work
      editorElt.contentDocument.execCommand("inserthtml", false, "<br>");
  }
}

function uninitPurpleCore()
{
  try {
    dump("toto s'en va : ");
    var ObserverService = Components.classes["@mozilla.org/observer-service;1"]
                                    .getService(Components.interfaces.nsIObserverService);
    ObserverService.removeObserver(msgObserver, "new message");
    ObserverService.removeObserver(msgObserver, "new text");
    var obj = Components.classes["@instantbird.org/purple/core;1"]
                        .getService(Components.interfaces.purpleICoreService);
    obj.quit();
  }
  catch (e) {
    alert(e);
  }
}

function showConsole() {
  window.open("chrome://global/content/console.xul", "_blank",
    "chrome,extrachrome,menubar,resizable,scrollbars,status,toolbar");
}

function onload() {
  const url = "chrome://instantbird/content/conv.html";
  var browser = document.getElementById("browser");
  browser.loadURI(url, null, null);
}

this.addEventListener("load", initPurpleCore, false);
