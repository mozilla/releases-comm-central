/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {XPCOMUtils} = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
const {DownloadUtils} = ChromeUtils.import("resource://gre/modules/DownloadUtils.jsm");

var {AppConstants} = ChromeUtils.import(
  "resource://gre/modules/AppConstants.jsm"
);

function Startup()
{
  updateActualCacheSize();
}

// Needs to be global because the cache service only keeps a weak reference.
var CacheObserver = {
  /* nsICacheStorageConsumptionObserver */
  onNetworkCacheDiskConsumption: function(aConsumption) {
    var actualSizeLabel = document.getElementById("cacheSizeInfo");
    var sizeStrings = DownloadUtils.convertByteUnits(aConsumption);
    var prefStrBundle = document.getElementById("bundle_prefutilities");
    var sizeStr = prefStrBundle.getFormattedString("cacheSizeInfo",
                                                    sizeStrings);
    actualSizeLabel.textContent = sizeStr;
  },

  /* nsISupports */
  QueryInterface: XPCOMUtils.generateQI(
    [Ci.nsICacheStorageConsumptionObserver,
     Ci.nsISupportsWeakReference])
};

// because the cache is in kilobytes, and the UI is in megabytes.
function ReadCacheDiskCapacity()
{
  var pref = document.getElementById("browser.cache.disk.capacity");
  return pref.value >> 10;
}

function WriteCacheDiskCapacity(aField)
{
  return aField.value << 10;
}

function ReadCacheFolder(aField)
{
  var pref = document.getElementById("browser.cache.disk.parent_directory");
  var file = pref.value;

  if (!file)
  {
    try
    {
      // no disk cache folder pref set; default to profile directory
      file = GetSpecialDirectory(Services.dirsvc.has("ProfLD") ? "ProfLD"
                                                               : "ProfD");
    }
    catch (ex) {}
  }

  if (file) {
    aField.file = file;
    aField.label = AppConstants.platform == "macosx" ? file.leafName : file.path;
  }
}

function CacheSelectFolder()
{
  let fp = Cc["@mozilla.org/filepicker;1"]
             .createInstance(Ci.nsIFilePicker);
  let title = document.getElementById("bundle_prefutilities")
                      .getString("cachefolder");

  fp.init(window, title, Ci.nsIFilePicker.modeGetFolder);
  fp.displayDirectory = 
    document.getElementById("browser.cache.disk.parent_directory").value;
  fp.appendFilters(Ci.nsIFilePicker.filterAll);

  fp.open(rv => {
    if (rv != Ci.nsIFilePicker.returnOK || !fp.file) {
      return;
    }
    document.getElementById("browser.cache.disk.parent_directory").value = fp.file;
  });
}

function ClearDiskAndMemCache()
{
  Services.cache2.clear();
  updateActualCacheSize();
}

function updateCacheSizeUI(cacheSizeEnabled)
{
  document.getElementById("browserCacheDiskCacheBefore").disabled = cacheSizeEnabled;
  document.getElementById("browserCacheDiskCache").disabled = cacheSizeEnabled;
  document.getElementById("browserCacheDiskCacheAfter").disabled = cacheSizeEnabled;
}

function ReadSmartSizeEnabled()
{
  var enabled = document.getElementById("browser.cache.disk.smart_size.enabled").value;
  updateCacheSizeUI(enabled);
  return enabled;
}

function updateActualCacheSize()
{
  Services.cache2.asyncGetDiskConsumption(CacheObserver);
}
