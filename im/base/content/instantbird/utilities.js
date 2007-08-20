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
