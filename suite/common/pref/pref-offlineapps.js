/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
 
Components.utils.import("resource://gre/modules/DownloadUtils.jsm");
Components.utils.import("resource://gre/modules/Services.jsm");

function Startup()
{
  OfflineAppsObserver.init();

  let always = document.getElementById("offline-apps.allow_by_default").value;
  UpdateNotifyBox(always);
}

var OfflineAppsObserver = {

  init: function offlineAppsInit() {
    this.update();
    Services.obs.addObserver(this, "perm-changed", false);
    window.addEventListener("unload", this, false);
  },

  update: function offlineAppsUpdate() {
    UpdateActualCacheSize();
    UpdateOfflineApps();
  },

  observe: function offlineAppsObserve(aSubject, aTopic, aData) {
    if (aTopic == "perm-changed")
      this.update();
  },

  handleEvent: function offlineAppsEvent(aEvent) {
    if (aEvent.type == "unload") {
      window.removeEventListener("unload", this, false);
      Services.obs.removeObserver(this, "perm-changed");
    }
  }
}

function UpdateActualCacheSize()
{
  var visitor = {
    onCacheStorageInfo: function(aEntryCount, aTotalSize)
    {
      let actualSizeLabel = document.getElementById("offlineAppSizeInfo");
      let sizeStrings = DownloadUtils.convertByteUnits(aTotalSize);
      let bundle = document.getElementById("bundle_prefutilities");
      let sizeStr = bundle.getFormattedString("offlineAppSizeInfo",
                                              sizeStrings);
      actualSizeLabel.textContent = sizeStr;
    },

    onCacheEntryInfo: function(entryInfo)
    {
    },

    onCacheEntryVisitCompleted: function()
    {
    }
  };

  Services.cache2.appCacheStorage(Services.loadContextInfo.default, null)
                 .asyncVisitStorage(visitor, false);
}

/**
 * Clears the application cache.
 */
var callback = {
  onCacheEntryDoomed: function(aResult) {
    UpdateActualCacheSize();
    UpdateOfflineApps();
  }
};

function ClearOfflineAppCache()
{
  try {
    Services.cache2.appCacheStorage(Services.loadContextInfo.default, null)
                   .asyncEvictStorage(callback);
  } catch(ex) {}
}

function UpdateNotifyBox(aValue)
{
  EnableElementById("offlineNotifyAsk", !aValue);

  // remove this once bug 934457 and bug 1024832 are fixed
  document.getElementById("offlineNotifyPermissions").disabled = aValue;
}

function _getOfflineAppUsage(aPermission)
{
  var appCache = Components.classes["@mozilla.org/network/application-cache-service;1"]
                           .getService(Components.interfaces.nsIApplicationCacheService);
  var groups = appCache.getGroups();

  var usage = 0;
  for (let i = 0; i < groups.length; i++) {
    let uri = Services.io.newURI(groups[i], null, null);
    if (aPermission.matchesURI(uri, true))
      usage += appCache.getActiveCache(groups[i]).usage;
  }
  return usage;
}

/**
 * Updates the list of offline applications.
 */
function UpdateOfflineApps()
{
  var list = document.getElementById("offlineAppsList");
  while (list.hasChildNodes())
    list.lastChild.remove();

  var bundle = document.getElementById("bundle_prefutilities");
  var pm = Services.perms;
  var enumerator = pm.enumerator;

  while (enumerator.hasMoreElements()) {
    let perm = enumerator.getNext()
                         .QueryInterface(Components.interfaces.nsIPermission);
    if (perm.type != "offline-app" ||
        perm.capability != pm.ALLOW_ACTION)
      continue;

    let usage = _getOfflineAppUsage(perm);
    let row = document.createElement("listitem");
    row.setAttribute("host", perm.principal.URI.host);
    let converted = DownloadUtils.convertByteUnits(usage);
    row.setAttribute("usage", bundle.getFormattedString("offlineAppUsage",
                                                        converted));
    list.appendChild(row);
  }
}

function OfflineAppSelected(aList)
{
  document.getElementById("offlineAppsListRemove")
          .setAttribute("disabled", !aList.selectedItem);
}

function RemoveOfflineApp()
{
  var list = document.getElementById("offlineAppsList");
  var item = list.selectedItem;
  var host = item.getAttribute("host");

  var flags = Services.prompt.BUTTON_TITLE_IS_STRING * Services.prompt.BUTTON_POS_0 +
              Services.prompt.BUTTON_TITLE_CANCEL * Services.prompt.BUTTON_POS_1;

  var bundle = document.getElementById("bundle_prefutilities");
  var title = bundle.getString("offlineAppRemoveTitle");
  var prompt = bundle.getFormattedString("offlineAppRemovePrompt", [host]);
  var confirm = bundle.getString("offlineAppRemoveConfirm");
  if (Services.prompt.confirmEx(window, title, prompt, flags, confirm,
                                null, null, null, {}))
    return;

  // clear offline cache entries
  var appCache = Components.classes["@mozilla.org/network/application-cache-service;1"]
                           .getService(Components.interfaces.nsIApplicationCacheService);
  var groups = appCache.getGroups();
  for (let i = 0; i < groups.length; i++) {
      var uri = Services.io.newURI(groups[i], null, null);
      if (uri.asciiHost == host)
          appCache.getActiveCache(groups[i]).discard();
  }

  // remove the permission
  // Services.perms.remove(host, "offline-app");

  UpdateOfflineApps();
  OfflineAppSelected(list);
  UpdateActualCacheSize();
}
