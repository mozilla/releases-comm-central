const Cc = Components.classes;
const Ci = Components.interfaces;

function getIter(aGetEnumFct, aIface)
{
  var enumerator = aGetEnumFct();
  while (enumerator.hasMoreElements()) {
    let item = enumerator.getNext();
    yield item.QueryInterface(aIface);
  }
}

function getObserverService()
{
  return Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
}

function addObservers(aObserver, aTopics)
{
  var observerService = getObserverService();
  for (let i = 0; i < aTopics.length; ++i)
    observerService.addObserver(aObserver, aTopics[i], false);
}

function removeObservers(aObserver, aTopics)
{
  var observerService = getObserverService();
  for (let i = 0; i < aTopics.length; ++i)
    observerService.removeObserver(aObserver, aTopics[i]);
}

function makeURI(aURL, aOriginCharset, aBaseURI)
{
  var ioService = Components.classes["@mozilla.org/network/io-service;1"]
                            .getService(Ci.nsIIOService);
  return ioService.newURI(aURL, aOriginCharset, aBaseURI);
}

function logMsg(aString)
{
  Components.classes["@mozilla.org/consoleservice;1"]
                     .getService(Ci.nsIConsoleService)
                     .logStringMessage(aString);
}

function setText(aElt, aTxt)
{
  if (aElt.hasChildNodes())
    aElt.removeChild(aElt.firstChild);
  var textNode = document.createTextNode(aTxt);
  aElt.appendChild(textNode);
}
