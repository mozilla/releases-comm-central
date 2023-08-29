/* -*- Mode: Javascript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {XPCOMUtils} = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetters(this, {
  Downloads: "resource://gre/modules/Downloads.jsm",
  FileUtils: "resource://gre/modules/FileUtils.jsm",
});

//******** define a js object to implement nsITreeView
function pageInfoTreeView(treeid, copycol)
{
  /* copycol is the index number for the column that we want to add to
   * the copy-n-paste buffer when the user hits accel-c.
   */
  this.treeid = treeid;
  this.copycol = copycol;
  this.rows = 0;
  this.tree = null;
  this.data = [ ];
  this.selection = null;
  this.sortcol = -1;
  this.sortdir = false;
}

pageInfoTreeView.prototype = {
  get rowCount() { return this.rows; },

  setTree: function(tree)
  {
    this.tree = tree;
  },

  getCellText: function(row, column)
  {
    // row can be null, but js arrays are 0-indexed.
    return this.data[row][column.index] || "";
  },

  setCellValue: function(row, column, value)
  {
  },

  setCellText: function(row, column, value)
  {
    this.data[row][column.index] = value;
  },

  addRow: function(row)
  {
    this.rows = this.data.push(row);
    this.rowCountChanged(this.rows - 1, 1);
    if (this.selection.count == 0 && this.rowCount && !gImageElement) {
      this.selection.select(0);
    }
  },

  addRows: function(rows)
  {
    for (let row of rows) {
      this.addRow(row);
    }
  },

  rowCountChanged: function(index, count)
  {
    this.tree.rowCountChanged(index, count);
  },

  invalidate: function()
  {
    this.tree.invalidate();
  },

  clear: function()
  {
    if (this.tree)
      this.tree.rowCountChanged(0, -this.rows);
    this.rows = 0;
    this.data = [];
  },

  cycleHeader: function cycleHeader(col)
  {
    this.doSort(col, col.index);
  },

  doSort: function doSort(col, index, comparator)
  {
    var tree = document.getElementById(this.treeid);
    if (!comparator) {
      comparator = function comparator(a, b) {
        return (a || "").toLowerCase().localeCompare((b || "").toLowerCase());
      };
    }

    this.sortdir = gTreeUtils.sort(tree, this, this.data, index,
                                   comparator, this.sortcol, this.sortdir);

    Array.from(this.tree.columns).forEach(function(treecol) {
      treecol.element.removeAttribute("sortActive");
      treecol.element.removeAttribute("sortDirection");
    });
    col.element.setAttribute("sortActive", true);
    col.element.setAttribute("sortDirection", this.sortdir ?
                                              "ascending" : "descending");

    this.sortcol = index;
  },

  getRowProperties: function(row) { return ""; },
  getCellProperties: function(row, column) { return ""; },
  getColumnProperties: function(column) { return ""; },
  isContainer: function(index) { return false; },
  isContainerOpen: function(index) { return false; },
  isSeparator: function(index) { return false; },
  isSorted: function() { return this.sortcol > -1 },
  canDrop: function(index, orientation) { return false; },
  drop: function(row, orientation) { return false; },
  getParentIndex: function(index) { return -1; },
  hasNextSibling: function(index, after) { return false; },
  getLevel: function(index) { return 0; },
  getImageSrc: function(row, column) { },
  getProgressMode: function(row, column) { },
  getCellValue: function(row, column) {
    let col = (column != null) ? column : this.copycol;
    return (row < 0 || col < 0) ? "" : (this.data[row][col] || "");
  },
  toggleOpenState: function(index) { },
  selectionChanged: function() { },
  cycleCell: function(row, column) { },
  isEditable: function(row, column) { return false; },
  isSelectable: function(row, column) { return false; },
};

// mmm, yummy. global variables.
var gDocInfo = null;
var gImageElement = null;

// column number to help using the data array
const COL_IMAGE_ADDRESS = 0;
const COL_IMAGE_TYPE    = 1;
const COL_IMAGE_SIZE    = 2;
const COL_IMAGE_ALT     = 3;
const COL_IMAGE_COUNT   = 4;
const COL_IMAGE_NODE    = 5;
const COL_IMAGE_BG      = 6;
const COL_IMAGE_SIZENUM = 7;
const COL_IMAGE_PERSIST = 8;
const COL_IMAGE_MIME    = 9;

// column number to copy from, second argument to pageInfoTreeView's constructor
const COPYCOL_NONE = -1;
const COPYCOL_META_CONTENT = 1;
const COPYCOL_FORM_ACTION = 2;
const COPYCOL_FIELD_VALUE = 3;
const COPYCOL_LINK_ADDRESS = 1;
const COPYCOL_IMAGE = COL_IMAGE_ADDRESS;

// one nsITreeView for each tree in the window
var gMetaView = new pageInfoTreeView("metatree", COPYCOL_META_CONTENT);
var gFormView = new pageInfoTreeView("formtree", COPYCOL_FORM_ACTION);
var gFieldView = new pageInfoTreeView("formpreview", COPYCOL_FIELD_VALUE);
var gLinkView = new pageInfoTreeView("linktree", COPYCOL_LINK_ADDRESS);
var gImageView = new pageInfoTreeView("imagetree", COPYCOL_IMAGE);

gImageView.getCellProperties = function(row, col) {
  var data = gImageView.data[row];
  var item = gImageView.data[row][COL_IMAGE_NODE];
  var properties = col.id == "image-address" ? "ltr" : "";
  if (!checkProtocol(data) || item.HTMLEmbedElement ||
      (item.HTMLObjectElement && !item.type.startsWith("image/")))
    properties += " broken";

  return properties;
};

gFormView.getCellProperties = function(row, col) {
  return col.id == "form-action" ? "ltr" : "";
};

gLinkView.getCellProperties = function(row, col) {
  return col.id == "link-address" ? "ltr" : "";
};

gImageView.cycleHeader = function(col)
{
  var index = col.index;
  var comparator;
  switch (col.index) {
    case COL_IMAGE_SIZE:
      index = COL_IMAGE_SIZENUM;
    case COL_IMAGE_COUNT:
      comparator = function numComparator(a, b) { return a - b; };
      break;
  }

  this.doSort(col, index, comparator);
};

var gImageHash = { };

// localized strings (will be filled in when the document is loaded)
// this isn't all of them, these are just the ones that would otherwise have been loaded inside a loop
var gStrings = { };
var gBundle;

const DRAGSERVICE_CONTRACTID    = "@mozilla.org/widget/dragservice;1";
const TRANSFERABLE_CONTRACTID   = "@mozilla.org/widget/transferable;1";
const STRING_CONTRACTID         = "@mozilla.org/supports-string;1";

var loadContextInfo = Services.loadContextInfo.fromLoadContext(
  window.QueryInterface(Ci.nsIInterfaceRequestor)
        .getInterface(Ci.nsIWebNavigation)
        .QueryInterface(Ci.nsILoadContext), false);
var diskStorage = Services.cache2.diskCacheStorage(loadContextInfo, false);

const nsICertificateDialogs = Ci.nsICertificateDialogs;
const CERTIFICATEDIALOGS_CONTRACTID = "@mozilla.org/nsCertificateDialogs;1"

/* Overlays register functions here.
 * These arrays are used to hold callbacks that Page Info will call at
 * various stages. Use them by simply appending a function to them.
 * For example, add a function to onLoadRegistry by invoking
 *   "onLoadRegistry.push(XXXLoadFunc);"
 * The XXXLoadFunc should be unique to the overlay module, and will be
 * invoked as "XXXLoadFunc();"
 */

// These functions are called to build the data displayed in the Page
// Info window.
var onLoadRegistry = [ ];

// These functions are called to remove old data still displayed in
// the window when the document whose information is displayed
// changes. For example, the list of images in the Media tab
// is cleared.
var onResetRegistry = [ ];

// These functions are called once when all the elements in all of the target
// document (and all of its subframes, if any) have been processed
var onFinished = [ ];

// These functions are called once when the Page Info window is closed.
var onUnloadRegistry = [ ];

/* Called when PageInfo window is loaded.  Arguments are:
 *  window.arguments[0] - (optional) an object consisting of
 *                         - doc: (optional) document to use for source. if not provided,
 *                                the calling window's document will be used
 *                         - initialTab: (optional) id of the inital tab to display
 */
function onLoadPageInfo()
{
  gBundle = document.getElementById("pageinfobundle");
  var strNames = ["unknown", "notSet", "mediaImg", "mediaBGImg",
                  "mediaBorderImg", "mediaListImg", "mediaCursor",
                  "mediaObject", "mediaEmbed", "mediaLink", "mediaInput",
                  "mediaVideo", "mediaAudio",
                  "formTitle", "formUntitled", "formDefaultTarget",
                  "formChecked", "formUnchecked", "formPassword", "linkAnchor",
                  "linkArea", "linkSubmission", "linkSubmit", "linkRel",
                  "linkStylesheet", "linkRev", "linkX", "linkScript",
                  "linkScriptInline", "yes"];
  strNames.forEach(function(n) { gStrings[n] = gBundle.getString(n); });

  var args = "arguments" in window &&
             window.arguments.length >= 1 &&
             window.arguments[0];

  // init views
  function initView(treeid, view)
  {
    document.getElementById(treeid).view = view;
  }

  initView("imagetree", gImageView);
  initView("formtree", gFormView);
  initView("formpreview", gFieldView);
  initView("linktree", gLinkView);
  initPermission();

  /* Select the requested tab, if the name is specified */
  loadTab(args);
  Services.obs.notifyObservers(window, "page-info-dialog-loaded");
}

function loadPageInfo(frameOuterWindowID, imageElement, browser)
{
  browser = browser || window.opener.gBrowser.selectedBrowser;
  let mm = browser.messageManager;

  gStrings["application/rss+xml"]  = gBundle.getString("feedRss");
  gStrings["application/atom+xml"] = gBundle.getString("feedAtom");
  gStrings["text/xml"]             = gBundle.getString("feedXML");
  gStrings["application/xml"]      = gBundle.getString("feedXML");
  gStrings["application/rdf+xml"]  = gBundle.getString("feedXML");

  // Look for pageInfoListener in content.js.
  // Sends message to listener with arguments.
  mm.sendAsyncMessage("PageInfo:getData", {strings: gStrings,
                      frameOuterWindowID: frameOuterWindowID},
                      { imageElement });

  let pageInfoData;

  // Get initial pageInfoData needed to display the general, feeds, permission
  // and security tabs.
  mm.addMessageListener("PageInfo:data", function onmessage(message) {
    mm.removeMessageListener("PageInfo:data", onmessage);
    pageInfoData = message.data;
    let docInfo = pageInfoData.docInfo;
    let windowInfo = pageInfoData.windowInfo;
    let uri = makeURI(docInfo.documentURIObject.spec);
    let principal = docInfo.principal;
    gDocInfo = docInfo;

    gImageElement = pageInfoData.imageInfo;

    var titleFormat = windowInfo.isTopWindow ? "pageInfo.page.title"
                                             : "pageInfo.frame.title";
    document.title = gBundle.getFormattedString(titleFormat,
                                                [docInfo.location]);

    document.getElementById("main-window").setAttribute("relatedUrl",
                                                        docInfo.location);

    makeGeneralTab(pageInfoData.metaViewRows, docInfo);
    initFeedTab(pageInfoData.feeds);
    onLoadPermission(uri, principal);
    securityOnLoad(uri, windowInfo);
  });

  // Get the media elements from content script to setup the media tab.
  mm.addMessageListener("PageInfo:mediaData", function onmessage(message) {
    // Page info window was closed.
    if (window.closed) {
      mm.removeMessageListener("PageInfo:mediaData", onmessage);
      return;
    }

    // The page info media fetching has been completed.
    if (message.data.isComplete) {
      mm.removeMessageListener("PageInfo:mediaData", onmessage);
      onFinished.forEach(function(func) { func(pageInfoData); });
      return;
    }

    if (message.data.imageItems) {
      for (let item of message.data.imageItems) {
        addImage(item);
      }
      selectImage();
    }

    if (message.data.linkItems) {
      gLinkView.addRows(message.data.linkItems);
    }

    if (message.data.formItems) {
      gFormView.addRows(message.data.formItems);
    }
  });

  /* Call registered overlay init functions */
  onLoadRegistry.forEach(function(func) { func(); });
}

function resetPageInfo(args)
{
  /* Reset Media tab */
  // Remove the observer, only if there is at least 1 image.
  if (gImageView.data.length != 0) {
    Services.obs.removeObserver(imagePermissionObserver, "perm-changed");
  }

  /* Reset tree views */
  gMetaView.clear();
  gFormView.clear();
  gFieldView.clear();
  gLinkView.clear();
  gImageView.clear();
  gImageHash = {};

  /* Reset Feeds Tab */
  var feedListbox = document.getElementById("feedListbox");
  while (feedListbox.hasChildNodes())
    feedListbox.lastChild.remove();

  /* Call registered overlay reset functions */
  onResetRegistry.forEach(function(func) { func(); });

  /* Rebuild the data */
  loadTab(args);

  Services.obs.notifyObservers(window, "page-info-dialog-reset");
}

function onUnloadPageInfo()
{
  // Remove the observer, only if there is at least 1 image.
  if (gImageView.data.length != 0) {
    Services.obs.removeObserver(imagePermissionObserver, "perm-changed");
  }

  /* Call registered overlay unload functions */
  onUnloadRegistry.forEach(function(func) { func(); });
}

function doHelpButton()
{
  const helpTopics = {
    "generalTab":  "pageinfo_general",
    "mediaTab":    "pageinfo_media",
    // "feedTab":     "pageinfo_feed",
    // "permTab":     "pageinfo_permissions",
    "formsTab":    "pageinfo_forms",
    "linksTab":    "pageinfo_links",
    "securityTab": "pageinfo_security"
  };

  var tabbox = document.getElementById("tabbox");
  var helpdoc = helpTopics[tabbox.selectedTab.id] || "nav-page-info";
  openHelp(helpdoc, "chrome://communicator/locale/help/suitehelp.rdf");
}

function showTab(id)
{
  var tabbox = document.getElementById("tabbox");
  var selectedTab = document.getElementById(id) ||
                    document.getElementById(id + "Tab") || // Firefox compatibility sillyness
                    document.getElementById("generalTab");
  tabbox.selectedTab = selectedTab;
  selectedTab.focus();
}

function loadTab(args)
{
  // If the "View Image Info" context menu item was used, the related image
  // element is provided as an argument. This can't be a background image.
  let imageElement = args && args.imageElement;
  let frameOuterWindowID = args && args.frameOuterWindowID;
  let browser = args && args.browser;

  /* Load the page info */
  loadPageInfo(frameOuterWindowID, imageElement, browser);

  /* Select the requested tab, if the name is specified */
  var initialTab = (args && args.initialTab) || "generalTab";
  showTab(initialTab);
}

function onClickMore()
{
  showTab("securityTab");
}

function openCacheEntry(key, cb)
{
  var checkCacheListener = {
    onCacheEntryCheck: function(entry, appCache) {
      return Ci.nsICacheEntryOpenCallback.ENTRY_WANTED;
    },
    onCacheEntryAvailable: function(entry, isNew, appCache, status) {
      cb(entry);
    }
  };
  diskStorage.asyncOpenURI(Services.io.newURI(key, null, null), "",
                           Ci.nsICacheStorage.OPEN_READONLY,
                           checkCacheListener);
}

function makeGeneralTab(metaViewRows, docInfo)
{
  var title = (docInfo.title) ? docInfo.title : gBundle.getString("noPageTitle");
  document.getElementById("titletext").value = title;

  var url = docInfo.location.toString();
  setItemValue("urltext", url);

  var referrer = ("referrer" in docInfo && docInfo.referrer);
  setItemValue("refertext", referrer);

  var mode = ("compatMode" in docInfo && docInfo.compatMode == "BackCompat") ? "generalQuirksMode" : "generalStrictMode";
  document.getElementById("modetext").value = gBundle.getString(mode);

  // find out the mime type
  var mimeType = docInfo.contentType;
  setItemValue("typetext", mimeType);

  // get the document characterset
  var encoding = docInfo.characterSet;
  document.getElementById("encodingtext").value = encoding;

  var length = metaViewRows.length;

  var metaGroup = document.getElementById("metaTags");
  if (!length) {
    metaGroup.collapsed = true;
  }
  else {
    var metaTagsCaption = document.getElementById("metaTagsCaption");
    if (length == 1)
      metaTagsCaption.label = gBundle.getString("generalMetaTag");
    else
      metaTagsCaption.label = gBundle.getFormattedString("generalMetaTags", [length]);
    var metaTree = document.getElementById("metatree");
    metaTree.view = gMetaView;

    // Add the metaViewRows onto the general tab's meta info tree.
    gMetaView.addRows(metaViewRows);

    metaGroup.collapsed = false;
  }

  // get the date of last modification
  var modifiedText = formatDate(docInfo.lastModified, gStrings.notSet);
  document.getElementById("modifiedtext").value = modifiedText;

  // get cache info
  var cacheKey = url.replace(/#.*$/, "");
  openCacheEntry(cacheKey, function(cacheEntry) {
    var sizeText;
    if (cacheEntry) {
      var pageSize = cacheEntry.dataSize;
      var kbSize = formatNumber(Math.round(pageSize / 1024 * 100) / 100);
      sizeText = gBundle.getFormattedString("generalSize", [kbSize, formatNumber(pageSize)]);
    }
    setItemValue("sizetext", sizeText);
  });
}

function ensureSelection(view)
{
  // only select something if nothing is currently selected
  // and if there's anything to select
  if (view.selection && view.selection.count == 0 && view.rowCount)
    view.selection.select(0);
}

function addImage(imageViewRow)
{
  let [url, type, alt, elem, isBg] = imageViewRow;

  if (!url)
    return;

  if (!gImageHash.hasOwnProperty(url))
    gImageHash[url] = { };
  if (!gImageHash[url].hasOwnProperty(type))
    gImageHash[url][type] = { };
  if (!gImageHash[url][type].hasOwnProperty(alt)) {
    gImageHash[url][type][alt] = gImageView.data.length;
    var row = [url, type, gStrings.unknown, alt, 1, elem, isBg, -1, null, null];
    gImageView.addRow(row);

    // Fill in cache data asynchronously
    openCacheEntry(url, function(cacheEntry) {
      if (cacheEntry) {
        // Update the corresponding data entries from the cache.
        var imageSize = cacheEntry.dataSize;
        // If it is not -1 then replace with actual value, else keep as unknown.
        if (imageSize && imageSize != -1) {
          var kbSize = Math.round(imageSize / 1024 * 100) / 100;
          row[2] = gBundle.getFormattedString("mediaFileSize",
                                              [formatNumber(kbSize)]);
          row[7] = imageSize;
        }
        row[8] = cacheEntry.persistent;
        row[9] = getContentTypeFromHeaders(cacheEntry);
        // Invalidate the row to trigger a repaint.
        gImageView.tree.invalidateRow(gImageView.data.indexOf(row));
      }
    });

    // Add the observer, only once.
    if (gImageView.data.length == 1) {
      Services.obs.addObserver(imagePermissionObserver, "perm-changed");
    }
  }
  else {
    var i = gImageHash[url][type][alt];
    gImageView.data[i][COL_IMAGE_COUNT]++;
    // The same image can occur several times on the page at different sizes.
    // If the "View Image Info" context menu item was used, ensure we select
    // the correct element.
    if (!gImageView.data[i][COL_IMAGE_BG] &&
        gImageElement && url == gImageElement.currentSrc &&
        gImageElement.width == elem.width &&
        gImageElement.height == elem.height &&
        gImageElement.imageText == elem.imageText) {
      gImageView.data[i][COL_IMAGE_NODE] = elem;
    }
  }
}

//******** Form Stuff
function onFormSelect()
{
  if (gFormView.selection.count == 1)
  {
    var formPreview = document.getElementById("formpreview");
    gFieldView.clear();
    formPreview.view = gFieldView;

    var clickedRow = gFormView.selection.currentIndex;
    // form-node;
    var form = gFormView.data[clickedRow][3];

    var ft = null;
    if (form.name)
      ft = gBundle.getFormattedString("formTitle", [form.name]);

    setItemValue("formenctype", form.encoding, gStrings.default);
    setItemValue("formtarget", form.target, gStrings.formDefaultTarget);
    document.getElementById("formname").value = ft || gStrings.formUntitled;

    gFieldView.addRows(form.formfields);
  }
}

//******** Link Stuff
function onBeginLinkDrag(event,urlField,descField)
{
  if (event.originalTarget.localName != "treechildren")
    return;

  var tree = event.target;
  if (!("treeBoxObject" in tree))
    tree = tree.parentNode;

  var row = tree.treeBoxObject.getRowAt(event.clientX, event.clientY);
  if (row == -1)
    return;

  // Adding URL flavor
  var col = tree.columns[urlField];
  var url = tree.view.getCellText(row, col);
  col = tree.columns[descField];
  var desc = tree.view.getCellText(row, col);

  var dataTransfer = event.dataTransfer;
  dataTransfer.setData("text/x-moz-url", url + "\n" + desc);
  dataTransfer.setData("text/url-list", url);
  dataTransfer.setData("text/plain", url);
}

//******** Image Stuff
function getSelectedRows(tree) {
  var start = { };
  var end   = { };
  var numRanges = tree.view.selection.getRangeCount();

  var rowArray = [ ];
  for (var t = 0; t < numRanges; t++) {
    tree.view.selection.getRangeAt(t, start, end);
    for (var v = start.value; v <= end.value; v++)
      rowArray.push(v);
  }

  return rowArray;
}

function getSelectedRow(tree) {
  var rows = getSelectedRows(tree);
  return (rows.length == 1) ? rows[0] : -1;
}

function selectSaveFolder(aCallback) {
  return selectSaveFolderTask(aCallback).catch(Cu.reportError);
}

async function selectSaveFolderTask(aCallback) {
  let titleText = gBundle.getString("mediaSelectFolder");
  let fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);

  fp.init(window, titleText, Ci.nsIFilePicker.modeGetFolder);
  fp.appendFilters(Ci.nsIFilePicker.filterAll);
  try {
    let initialDir = Services.prefs.getComplexValue("browser.download.dir",
                                                    Ci.nsIFile);
    if (!initialDir) {
      let downloadsDir = await Downloads.getSystemDownloadsDirectory();
      initialDir = new FileUtils.File(downloadsDir);
    }

    fp.displayDirectory = initialDir;
  } catch (ex) {
  }

  let result = await new Promise(resolve => fp.open(resolve));

  if (result == Ci.nsIFilePicker.returnOK) {
    aCallback(fp.file.QueryInterface(Ci.nsIFile));
  } else {
    aCallback(null);
  }
}

function saveMedia()
{
  var tree = document.getElementById("imagetree");
  var rowArray = getSelectedRows(tree);
  if (rowArray.length == 1) {
    let row = rowArray[0];
    let item = gImageView.data[row][COL_IMAGE_NODE];
    let url = gImageView.data[row][COL_IMAGE_ADDRESS];

    if (url) {
      let titleKey = "SaveImageTitle";

      if (item instanceof HTMLVideoElement)
        titleKey = "SaveVideoTitle";
      else if (item instanceof HTMLAudioElement)
        titleKey = "SaveAudioTitle";

      saveURL(url, null, titleKey, false, false, makeURI(item.baseURI),
              null, gDocInfo.isContentWindowPrivate,
              gDocument.nodePrincipal);
    }
  } else {
    selectSaveFolder(function(aDirectory) {
      if (aDirectory) {
        var saveAnImage = function(aURIString, aChosenData, aBaseURI) {
          uniqueFile(aChosenData.file);
          internalSave(aURIString, null, null, null, null, false,
                       "SaveImageTitle", aChosenData, aBaseURI, null, false,
                       null, gDocInfo.isContentWindowPrivate,
                       gDocument.nodePrincipal);
        };

        for (var i = 0; i < rowArray.length; i++) {
          let v = rowArray[i];
          let dir = aDirectory.clone();
          let item = gImageView.data[v][COL_IMAGE_NODE];
          let uriString = gImageView.data[v][COL_IMAGE_ADDRESS];
          let uri = makeURI(uriString);

          try {
            uri.QueryInterface(Ci.nsIURL);
            dir.append(decodeURIComponent(uri.fileName));
          } catch (ex) {
            // data:/blob: uris
            // Supply a dummy filename, otherwise Download Manager
            // will try to delete the base directory on failure.
            dir.append(gImageView.data[v][COL_IMAGE_TYPE]);
          }

          if (i == 0) {
            saveAnImage(uriString, new AutoChosen(dir, uri), makeURI(item.baseURI));
          } else {
            // This delay is a hack which prevents the download manager
            // from opening many times. See bug 377339.
            setTimeout(saveAnImage, 200, uriString, new AutoChosen(dir, uri),
                       makeURI(item.baseURI));
          }
        }
      }
    });
  }
}

function onBlockImage(aChecked)
{
  var uri = makeURI(document.getElementById("imageurltext").value);
  if (aChecked)
    Services.perms.add(uri, "image", Services.perms.DENY_ACTION);
  else
    Services.perms.remove(uri, "image");
}

function onImageSelect()
{
  var previewBox      = document.getElementById("mediaPreviewBox");
  var mediaSaveBox    = document.getElementById("mediaSaveBox");
  var mediaSaveButton = document.getElementById("imagesaveasbutton");
  var splitter        = document.getElementById("mediaSplitter");
  var tree            = document.getElementById("imagetree");
  var count           = tree.view.selection.count;

  if (count == 0)
  {
    previewBox.collapsed     = true;
    mediaSaveBox.collapsed   = true;
    mediaSaveButton.disabled = true;
    splitter.collapsed       = true;
    tree.flex = 1;
  }
  else if (count > 1)
  {
    previewBox.collapsed     = true;
    mediaSaveBox.collapsed   = false;
    mediaSaveButton.disabled = false;
    splitter.collapsed       = true;
    tree.flex = 1;
  }
  else
  {
    previewBox.collapsed     = false;
    mediaSaveBox.collapsed   = true;
    mediaSaveButton.disabled = false;
    splitter.collapsed       = false;
    tree.flex = 0;
    makePreview(tree.view.selection.currentIndex);
  }
}

// Makes the media preview (image, video, etc) for the selected row on
// the media tab.
function makePreview(row)
{
  var [url, type, sizeText, alt, count, item, isBG, imageSize, persistent, cachedType] = gImageView.data[row];
  var isAudio = false;

  setItemValue("imageurltext", url);
  setItemValue("imagetext", item.imageText);
  setItemValue("imagelongdesctext", item.longDesc);

  // get cache info
  var sourceText;
  switch (persistent) {
    case true:
      sourceText = gBundle.getString("generalDiskCache");
      break;
    case false:
      sourceText = gBundle.getString("generalMemoryCache");
      break;
    default:
      sourceText = gBundle.getString("generalNotCached");
      break;
  }
  setItemValue("imagesourcetext", sourceText);

  // find out the file size
  var sizeText;
  if (imageSize && imageSize != -1) {
    var kbSize = Math.round(imageSize / 1024 * 100) / 100;
    sizeText = gBundle.getFormattedString("generalSize",
                                          [formatNumber(kbSize),
                                           formatNumber(imageSize)]);
  }
  else
    sizeText = gBundle.getString("mediaUnknownNotCached");
  setItemValue("imagesizetext", sizeText);

  var mimeType = item.mimeType || cachedType;
  var numFrames = item.numFrames;

  var imageType;
  if (mimeType) {
    // We found the type, try to display it nicely
    let imageMimeType = /^image\/(.*)/i.exec(mimeType);
    if (imageMimeType) {
      imageType = imageMimeType[1].toUpperCase();
      if (numFrames > 1)
        imageType = gBundle.getFormattedString("mediaAnimatedImageType",
                                               [imageType, numFrames]);
      else
        imageType = gBundle.getFormattedString("mediaImageType", [imageType]);
    }
    else {
      // the MIME type doesn't begin with image/, display the raw type
      imageType = mimeType;
    }
  }
  else {
    // We couldn't find the type, fall back to the value in the treeview
    imageType = type;
  }

  setItemValue("imagetypetext", imageType);

  var imageContainer = document.getElementById("theimagecontainer");
  var oldImage = document.getElementById("thepreviewimage");

  var isProtocolAllowed = checkProtocol(gImageView.data[row]);
  var isImageType = mimeType && mimeType.startsWith("image/");

  var newImage = new Image;
  newImage.id = "thepreviewimage";
  var physWidth = 0, physHeight = 0;
  var width = 0, height = 0;

  if ((item.HTMLLinkElement || item.HTMLInputElement ||
       item.HTMLImageElement || item.SVGImageElement ||
      (item.HTMLObjectElement && isImageType) ||
      (item.HTMLEmbedElement && isImageType) ||
       isBG) && isProtocolAllowed) {
    // We need to wait for the image to finish loading before
    // using width & height.
    newImage.addEventListener("loadend", function() {
      physWidth = newImage.width || 0;
      physHeight = newImage.height || 0;

      // "width" and "height" attributes must be set to newImage,
      // even if there is no "width" or "height attribute in item;
      // otherwise, the preview image cannot be displayed correctly.
      // Since the image might have been loaded out-of-process, we expect
      // the item to tell us its width / height dimensions. Failing that
      // the item should tell us the natural dimensions of the image. Finally
      // failing that, we'll assume that the image was never loaded in the
      // other process (this can be true for favicons, for example), and so
      // we'll assume that we can use the natural dimensions of the newImage
      // we just created. If the natural dimensions of newImage are not known
      // then the image is probably broken.
      if (!isBG) {
        newImage.width = ("width" in item && item.width) ||
                         newImage.naturalWidth;
        newImage.height = ("height" in item && item.height) ||
                          newImage.naturalHeight;
      }
      else {
        // The width and height of an HTML tag should not be used for its
        // background image (for example, "table" can have "width" or "height"
        // attributes).
        newImage.width = item.naturalWidth || newImage.naturalWidth;
        newImage.height = item.naturalHeight || newImage.naturalHeight;
      }

      if (item.SVGImageElement) {
        newImage.width = item.SVGImageElementWidth;
        newImage.height = item.SVGImageElementHeight;
      }

      width = newImage.width;
      height = newImage.height;

      document.getElementById("theimagecontainer").collapsed = false
      document.getElementById("brokenimagecontainer").collapsed = true;

      let imageSize = "";
      if (url) {
        if (width != physWidth || height != physHeight) {
          imageSize = gBundle.getFormattedString("mediaDimensionsScaled",
                                                 [formatNumber(physWidth),
                                                  formatNumber(physHeight),
                                                  formatNumber(width),
                                                  formatNumber(height)]);
        } else {
          imageSize = gBundle.getFormattedString("mediaDimensions",
                                                 [formatNumber(width),
                                                  formatNumber(height)]);
        }
      }
      setItemValue("imagedimensiontext", imageSize);
    }, {once: true});

    newImage.setAttribute("src", url);
  }
  else {
    // Handle the case where newImage is not used for width & height.
    if (item.HTMLVideoElement && isProtocolAllowed) {
      newImage = document.createElementNS("http://www.w3.org/1999/xhtml", "video");
      newImage.id = "thepreviewimage";
      newImage.src = url;
      newImage.controls = true;
      width = physWidth = item.videoWidth;
      height = physHeight = item.videoHeight;

      document.getElementById("theimagecontainer").collapsed = false
      document.getElementById("brokenimagecontainer").collapsed = true;
    }
    else if (item.HTMLAudioElement && isProtocolAllowed) {
      newImage = new Audio;
      newImage.id = "thepreviewimage";
      newImage.src = url;
      newImage.controls = true;
      newImage.preload = "metadata";
      isAudio = true;

      document.getElementById("theimagecontainer").collapsed = false
      document.getElementById("brokenimagecontainer").collapsed = true;
    }
    else {
      // fallback image for protocols not allowed (e.g., javascript:)
      // or elements not [yet] handled (e.g., object, embed).
      document.getElementById("brokenimagecontainer").collapsed = false;
      document.getElementById("theimagecontainer").collapsed = true;
    }

    let imageSize = "";
    if (url && !isAudio) {
      imageSize = gBundle.getFormattedString("mediaDimensions",
                                             [formatNumber(width),
                                              formatNumber(height)]);
    }
    setItemValue("imagedimensiontext", imageSize);
  }

  makeBlockImage(url);

  oldImage.remove();
  imageContainer.appendChild(newImage);
}

function makeBlockImage(url)
{
  var checkbox = document.getElementById("blockImage");
  var imagePref = Services.prefs.getIntPref("permissions.default.image");
  if (!(/^https?:/.test(url)) || imagePref == 2)
    // We can't block the images from this host because either is is not
    // for http(s) or we don't load images at all
    checkbox.hidden = true;
  else {
    var uri = makeURI(url);
    if (uri.host) {
      checkbox.hidden = false;
      checkbox.label = gBundle.getFormattedString("mediaBlockImage", [uri.host]);
      var perm = Services.perms.testPermission(uri, "image");
      checkbox.checked = perm == Services.perms.DENY_ACTION;
    }
    else
      checkbox.hidden = true;
  }
}

var imagePermissionObserver = {
  observe: function (aSubject, aTopic, aData)
  {
    if (document.getElementById("mediaPreviewBox").collapsed)
      return;

    if (aTopic == "perm-changed") {
      var permission = aSubject.QueryInterface(Ci.nsIPermission);
      if (permission.type == "image") {
        var imageTree = document.getElementById("imagetree");
        var row = imageTree.currentIndex;
        var item = gImageView.data[row][COL_IMAGE_NODE];
        var url = gImageView.data[row][COL_IMAGE_ADDRESS];
        if (permission.matchesURI(makeURI(url), true))
          makeBlockImage(url);
      }
    }
  }
}

function getContentTypeFromHeaders(cacheEntryDescriptor)
{
  if (!cacheEntryDescriptor)
    return null;

  let headers = cacheEntryDescriptor.getMetaDataElement("response-head");
  let type = /^Content-Type:\s*(.*?)\s*(?:\;|$)/mi.exec(headers);
  return type && type[1];
}

function setItemValue(id, value, defaultString = gStrings.notSet)
{
  var item = document.getElementById(id);
  if (value) {
    item.disabled = false;
    item.value = value;
  }
  else
  {
    item.value = defaultString;
    item.disabled = true;
  }
}

function formatNumber(number)
{
  return (+number).toLocaleString();  // coerce number to a numeric value before calling toLocaleString()
}

function formatDate(datestr, unknown)
{
  var date = new Date(datestr);
  if (!date.valueOf())
    return unknown;

  const dateTimeFormatter = new Services.intl.DateTimeFormat(undefined, {
                            dateStyle: "full", timeStyle: "long"});
  return dateTimeFormatter.format(date);
}

function getSelectedItems(linksMode)
{
  // linksMode is a boolean that is used to determine
  // whether the getSelectedItems() function needs to
  // run with urlSecurityCheck() or not.

  var elem = document.commandDispatcher.focusedElement;

  var view = elem.view;
  var selection = view.selection;
  var text = [], tmp = '';
  var min = {}, max = {};

  var count = selection.getRangeCount();

  for (var i = 0; i < count; i++) {
    selection.getRangeAt(i, min, max);

    for (var row = min.value; row <= max.value; row++) {
      tmp = view.getCellValue(row, null);
      if (tmp)
      {
        try {
          if (linksMode)
            urlSecurityCheck(tmp, gDocInfo.principal);
          text.push(tmp);
        }
        catch (e) {
        }
      }
    }
  }

  return text;
}

function doCopy(isLinkMode)
{
  var text = getSelectedItems(isLinkMode);

  Cc["@mozilla.org/widget/clipboardhelper;1"]
    .getService(Ci.nsIClipboardHelper)
    .copyString(text.join("\n"));
}

function doSelectAllMedia()
{
  var tree = document.getElementById("imagetree");

  if (tree)
    tree.view.selection.selectAll();
}

function doSelectAll()
{
  var elem = document.commandDispatcher.focusedElement;

  if (elem && "treeBoxObject" in elem)
    elem.view.selection.selectAll();
}

function selectImage() {
  if (!gImageElement)
    return;

  var tree = document.getElementById("imagetree");
  for (var i = 0; i < tree.view.rowCount; i++) {
    // If the image row element is the image selected from
    // the "View Image Info" context menu item.
    let image = gImageView.data[i][COL_IMAGE_NODE];
    if (!gImageView.data[i][COL_IMAGE_BG] &&
        gImageElement.currentSrc == gImageView.data[i][COL_IMAGE_ADDRESS] &&
        gImageElement.width == image.width &&
        gImageElement.height == image.height &&
        gImageElement.imageText == image.imageText) {
      tree.view.selection.select(i);
      tree.treeBoxObject.ensureRowIsVisible(i);
      tree.focus();
      return;
    }
  }
}

function checkProtocol(img)
{
  var url = img[COL_IMAGE_ADDRESS];
  return /^data:image\//i.test(url) ||
    /^(https?|ftp|file|about|chrome|resource):/.test(url);
}

function onOpenIn(mode)
{
  var linkList = getSelectedItems(true);

  if (linkList.length)
    openUILinkArrayIn(linkList, mode);
}
