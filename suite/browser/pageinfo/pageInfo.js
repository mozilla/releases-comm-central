/* -*- Mode: Javascript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");
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
    if (this.selection.count == 0 && this.rowCount && !gImageElement)
      this.selection.select(0);
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

  handleCopy: function(row)
  {
    return (row < 0 || this.copycol < 0) ? "" : (this.data[row][this.copycol] || "");
  },

  performActionOnRow: function(action, row)
  {
    if (action == "copy") {
      var data = this.handleCopy(row)
      this.tree.treeBody.parentNode.setAttribute("copybuffer", data);
    }
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
  getCellValue: function(row, column) { },
  toggleOpenState: function(index) { },
  selectionChanged: function() { },
  cycleCell: function(row, column) { },
  isEditable: function(row, column) { return false; },
  isSelectable: function(row, column) { return false; },
};

// mmm, yummy. global variables.
var gWindow = null;
var gDocument = null;
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
  if (!checkProtocol(data) ||
      item instanceof HTMLEmbedElement ||
      (item instanceof HTMLObjectElement && !item.type.startsWith("image/")))
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

// Interface for image loading content
const nsIImageLoadingContent = Ci.nsIImageLoadingContent;

// namespaces, don't need all of these yet...
const MathMLNS = "http://www.w3.org/1998/Math/MathML";
const XLinkNS  = "http://www.w3.org/1999/xlink";
const XULNS    = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
const XMLNS    = "http://www.w3.org/XML/1998/namespace";
const XHTMLNS  = "http://www.w3.org/1999/xhtml";
const XHTML2NS = "http://www.w3.org/2002/06/xhtml2"

const XHTMLNSre  = "^http\:\/\/www\.w3\.org\/1999\/xhtml$";
const XHTML2NSre = "^http\:\/\/www\.w3\.org\/2002\/06\/xhtml2$";
const XHTMLre = RegExp(XHTMLNSre + "|" + XHTML2NSre, "");

/* Overlays register functions here.
 * These arrays are used to hold callbacks that Page Info will call at
 * various stages. Use them by simply appending a function to them.
 * For example, add a function to onLoadRegistry by invoking
 *   "onLoadRegistry.push(XXXLoadFunc);"
 * The XXXLoadFunc should be unique to the overlay module, and will be
 * invoked as "XXXLoadFunc();"
 */

// These functions are called to build the data displayed in the Page
// Info window. The global variables gDocument and gWindow are set.
var onLoadRegistry = [ ];

// These functions are called to remove old data still displayed in
// the window when the document whose information is displayed
// changes. For example, the list of images in the Media tab
// is cleared.
var onResetRegistry = [ ];

// These are called once for each subframe of the target document and
// the target document itself. The frame is passed as an argument.
var onProcessFrame = [ ];

// These functions are called once for each element (in all subframes, if any)
// in the target document. The element is passed as an argument.
var onProcessElement = [ ];

// These functions are called once when all the elements in all of the target
// document (and all of its subframes, if any) have been processed
var onFinished = [ ];

// These functions are called once when the Page Info window is closed.
var onUnloadRegistry = [ ];

// These functions are called once when an image preview is shown.
var onImagePreviewShown = [ ];

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

  if (!args || !args.doc) {
    gWindow = window.opener.gBrowser.selectedBrowser.contentWindowAsCPOW;
    gDocument = gWindow.document;
  }

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

function loadPageInfo()
{
  var titleFormat = gWindow != gWindow.top ? "pageInfo.frame.title"
                                           : "pageInfo.page.title";
  document.title = gBundle.getFormattedString(titleFormat, [gDocument.location]);

  document.getElementById("main-window").setAttribute("relatedUrl", gDocument.location);

  // do the easy stuff first
  makeGeneralTab();

  // and then the hard stuff
  makeTabs(gDocument, gWindow);

  initFeedTab();
  onLoadPermission();

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
  if (args && args.doc) {
    gDocument = args.doc;
    gWindow = gDocument.defaultView;
  }

  // set gImageElement if present
  gImageElement = args && args.imageElement;

  /* Load the page info */
  loadPageInfo();

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

function makeGeneralTab()
{
  var title = (gDocument.title) ? gBundle.getFormattedString("pageTitle", [gDocument.title]) : gBundle.getString("noPageTitle");
  document.getElementById("titletext").value = title;

  var url = gDocument.location.toString();
  setItemValue("urltext", url);

  var referrer = ("referrer" in gDocument && gDocument.referrer);
  setItemValue("refertext", referrer);

  var mode = ("compatMode" in gDocument && gDocument.compatMode == "BackCompat") ? "generalQuirksMode" : "generalStrictMode";
  document.getElementById("modetext").value = gBundle.getString(mode);

  // find out the mime type
  var mimeType = gDocument.contentType;
  setItemValue("typetext", mimeType);

  // get the document characterset
  var encoding = gDocument.characterSet;
  document.getElementById("encodingtext").value = encoding;

  // get the meta tags
  var metaNodes = gDocument.getElementsByTagName("meta");
  var length = metaNodes.length;

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

    for (var i = 0; i < length; i++)
      gMetaView.addRow([metaNodes[i].name || metaNodes[i].httpEquiv ||
                        metaNodes[i].getAttribute("property"),
                        metaNodes[i].content]);

    metaGroup.collapsed = false;
  }

  // get the date of last modification
  var modifiedText = formatDate(gDocument.lastModified, gStrings.notSet);
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

  securityOnLoad();
}

//******** Generic Build-a-tab
// Assumes the views are empty. Only called once to build the tabs, and
// does so by farming the task off to another thread via setTimeout().
// The actual work is done with a TreeWalker that calls doGrab() once for
// each element node in the document.

var gFrameList = [ ];

function makeTabs(aDocument, aWindow)
{
  goThroughFrames(aDocument, aWindow);
  processFrames();
}

function goThroughFrames(aDocument, aWindow)
{
  gFrameList.push(aDocument);
  if (aWindow && aWindow.frames.length > 0) {
    var num = aWindow.frames.length;
    for (var i = 0; i < num; i++)
      goThroughFrames(aWindow.frames[i].document, aWindow.frames[i]);  // recurse through the frames
  }
}

function processFrames()
{
  if (gFrameList.length) {
    var doc = gFrameList[0];
    onProcessFrame.forEach(function(func) { func(doc); });
    var iterator = doc.createTreeWalker(doc, NodeFilter.SHOW_ELEMENT, grabAll, true);
    gFrameList.shift();
    setTimeout(doGrab, 10, iterator);
    onFinished.push(selectImage);
  }
  else
    onFinished.forEach(function(func) { func(); });
}

function doGrab(iterator)
{
  for (var i = 0; i < 500; ++i)
    if (!iterator.nextNode()) {
      processFrames();
      return;
    }

  setTimeout(doGrab, 10, iterator);
}

function ensureSelection(view)
{
  // only select something if nothing is currently selected
  // and if there's anything to select
  if (view.selection && view.selection.count == 0 && view.rowCount)
    view.selection.select(0);
}

function addImage(url, type, alt, elem, isBg)
{
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
        var currentIndex = gImageView.data.indexOf(row);
        gImageView.tree.invalidateRow(currentIndex);
        if (gImageView.selection.count == 1 &&
            gImageView.selection.currentIndex == currentIndex) {
          makePreview(currentIndex);
        }
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
    if (elem == gImageElement)
      gImageView.data[i][COL_IMAGE_NODE] = elem;
  }
}

function grabAll(elem)
{
  // Check for images defined in CSS (e.g. background, borders),
  // any node may have multiple.
  var computedStyle = elem.ownerDocument.defaultView.getComputedStyle(elem, "");

  if (computedStyle) {
    var addImgFunc = function (label, val) {
      if (val.primitiveType == CSSPrimitiveValue.CSS_URI) {
        addImage(val.getStringValue(), label, gStrings.notSet, elem, true);
      }
      else if (val.primitiveType == CSSPrimitiveValue.CSS_STRING) {
        // This is for -moz-image-rect.
        // TODO: Reimplement once bug 714757 is fixed
        var strVal = val.getStringValue();
        if (strVal.search(/^.*url\(\"?/) > -1) {
          url = strVal.replace(/^.*url\(\"?/,"").replace(/\"?\).*$/,"");
          addImage(url, label, gStrings.notSet, elem, true);
        }
      }
      else if (val.cssValueType == CSSValue.CSS_VALUE_LIST) {
        // recursively resolve multiple nested CSS value lists
        for (var i = 0; i < val.length; i++)
          addImgFunc(label, val.item(i));
      }
    };

    addImgFunc(gStrings.mediaBGImg, computedStyle.getPropertyCSSValue("background-image"));
    addImgFunc(gStrings.mediaBorderImg, computedStyle.getPropertyCSSValue("border-image-source"));
    addImgFunc(gStrings.mediaListImg, computedStyle.getPropertyCSSValue("list-style-image"));
    addImgFunc(gStrings.mediaCursor, computedStyle.getPropertyCSSValue("cursor"));
  }

  // one swi^H^H^Hif-else to rule them all
  if (elem instanceof HTMLAnchorElement)
    gLinkView.addRow([getValueText(elem), elem.href, gStrings.linkAnchor, elem.target, elem.accessKey]);
  else if (elem instanceof HTMLImageElement)
    addImage(elem.src, gStrings.mediaImg,
             (elem.hasAttribute("alt")) ? elem.alt : gStrings.notSet, elem, false);
  else if (elem instanceof HTMLAreaElement)
    gLinkView.addRow([elem.alt, elem.href, gStrings.linkArea, elem.target, ""]);
  else if (elem instanceof HTMLVideoElement)
    addImage(elem.currentSrc, gStrings.mediaVideo, "", elem, false);
  else if (elem instanceof HTMLAudioElement)
    addImage(elem.currentSrc, gStrings.mediaAudio, "", elem, false);
  else if (elem instanceof HTMLLinkElement)
  {
    if (elem.rel)
    {
      var rel = elem.rel;
      if (/(?:^|\s)icon(?:\s|$)/i.test(rel))
        addImage(elem.href, gStrings.mediaLink, "", elem, false);
      else if (/(?:^|\s)stylesheet(?:\s|$)/i.test(rel))
        gLinkView.addRow([elem.rel, elem.href, gStrings.linkStylesheet, elem.target, ""]);
      else
        gLinkView.addRow([elem.rel, elem.href, gStrings.linkRel, elem.target, ""]);
    }
    else
      gLinkView.addRow([elem.rev, elem.href, gStrings.linkRev, elem.target, ""]);
  }
  else if (elem instanceof HTMLInputElement || elem instanceof HTMLButtonElement)
  {
    switch (elem.type.toLowerCase())
    {
      case "image":
        addImage(elem.src, gStrings.mediaInput, (elem.hasAttribute("alt")) ? elem.alt : gStrings.notSet, elem, false);
        // Fall through, <input type="image"> submits, too
      case "submit":
        if ("form" in elem && elem.form)
        {
          gLinkView.addRow([elem.value || getValueText(elem) || gStrings.linkSubmit,
                            elem.form.action, gStrings.linkSubmission, elem.form.target, ""]);
        }
        else
          gLinkView.addRow([elem.value || getValueText(elem) || gStrings.linkSubmit, "",
                            gStrings.linkSubmission, "", ""]);
    }
  }
  else if (elem instanceof HTMLFormElement)
    gFormView.addRow([elem.name, elem.method, elem.action, elem]);
  else if (elem instanceof HTMLObjectElement)
    addImage(elem.data, gStrings.mediaObject, getValueText(elem), elem, false);
  else if (elem instanceof HTMLEmbedElement)
    addImage(elem.src, gStrings.mediaEmbed, "", elem, false);
  else if (elem.namespaceURI == MathMLNS && elem.hasAttribute("href"))
  {
    url = elem.getAttribute("href");
    try {
      url = makeURLAbsolute(elem.baseURI, url, elem.ownerDocument.characterSet);
    } catch (e) {}
    gLinkView.addRow([getValueText(elem), url, gStrings.linkX, "", ""]);
  }
  else if (elem.hasAttributeNS(XLinkNS, "href"))
  {
    url = elem.getAttributeNS(XLinkNS, "href");
    try {
      url = makeURLAbsolute(elem.baseURI, url, elem.ownerDocument.characterSet);
    } catch (e) {}
    // SVG images without an xlink:href attribute are ignored
    if (elem instanceof SVGImageElement)
      addImage(url, gStrings.mediaImg, "", elem, false);
    else
      gLinkView.addRow([getValueText(elem), url, gStrings.linkX, "", ""]);
  }
  else if (elem instanceof HTMLScriptElement)
    gLinkView.addRow([elem.type || elem.getAttribute("language") || gStrings.notSet,
                      elem.src || gStrings.linkScriptInline,
                      gStrings.linkScript, "", "", ""]);

  onProcessElement.forEach(function(func) { func(elem); });

  return NodeFilter.FILTER_ACCEPT;
}

//******** Form Stuff
function onFormSelect()
{
  var formTree = document.getElementById("formtree");

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

    setItemValue("formenctype", form.encoding, gBundle.getString("default"));
    setItemValue("formtarget", form.target, gBundle.getString("formDefaultTarget"));
    document.getElementById("formname").value = ft || gBundle.getString("formUntitled");

    var formfields = form.elements;

    var length = formfields.length;

    var checked = gBundle.getString("formChecked");
    var unchecked = gBundle.getString("formUnchecked");

    for (var i = 0; i < length; i++)
    {
      var elem = formfields[i], val;

      if (elem instanceof HTMLButtonElement)
        val = getValueText(elem);
      else
        val = (/^password$/i.test(elem.type)) ? gBundle.getString("formPassword") : elem.value;

      gFieldView.addRow(["", elem.name, elem.type, val]);
    }

    var labels = form.getElementsByTagName("label");
    var llength = labels.length;
    var label;

    for (i = 0; i < llength; i++)
    {
      label = labels[i];
      var whatfor = label.hasAttribute("for") ?
        gDocument.getElementById(label.getAttribute("for")) :
        findFirstControl(label);

      if (whatfor && (whatfor.form == form))
      {
        var labeltext = getValueText(label);
        for (var j = 0; j < length; j++)
          if (formfields[j] == whatfor) {
            var col = formPreview.columns["field-label"];
            gFieldView.setCellText(j, col, labeltext);
          }
      }
    }
  }
}

function FormControlFilter(node)
{
  if (node instanceof HTMLInputElement || node instanceof HTMLSelectElement ||
      node instanceof HTMLButtonElement || node instanceof HTMLTextAreaElement ||
      node instanceof HTMLObjectElement)
      return NodeFilter.FILTER_ACCEPT;
    return NodeFilter.FILTER_SKIP;
}

function findFirstControl(node)
{
  var iterator = gDocument.createTreeWalker(node, NodeFilter.SHOW_ELEMENT, FormControlFilter, true);

  return iterator.nextNode();
}

//******** Link Stuff
function openURL(target)
{
  var url = target.parentNode.childNodes[2].value;
  openNewTabWith(url, gDocument);
}

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
    let prefs = Cc[PREFERENCES_CONTRACTID].getService(Ci.nsIPrefBranch);
    let initialDir = prefs.getComplexValue("browser.download.dir",
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
              null, (opener.gPrivate ? true : false),
              gDocument.nodePrincipal);
    }
  } else {
    selectSaveFolder(function(aDirectory) {
      if (aDirectory) {
        var saveAnImage = function(aURIString, aChosenData, aBaseURI) {
          uniqueFile(aChosenData.file);
          internalSave(aURIString, null, null, null, null, false,
                       "SaveImageTitle", aChosenData, aBaseURI, null, false,
                       null, (opener.gPrivate ? true : false),
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

function makePreview(row)
{
  var [url, type, sizeText, alt, count, item, isBG, imageSize, persistent, cachedType] = gImageView.data[row];
  var isAudio = false;

  setItemValue("imageurltext", url);

  var imageText;
  if (!isBG &&
      !(item instanceof SVGImageElement) &&
      !(gDocument instanceof ImageDocument)) {
    imageText = item.title || item.alt;

    if (!imageText && !(item instanceof HTMLImageElement))
      imageText = getValueText(item);
  }
  setItemValue("imagetext", imageText);

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

  var mimeType;
  var numFrames = 1;
  if (item instanceof HTMLObjectElement ||
      item instanceof HTMLEmbedElement ||
      item instanceof HTMLLinkElement)
    mimeType = item.type;

  if (!mimeType && !isBG && item instanceof nsIImageLoadingContent) {
    var imageRequest = item.getRequest(nsIImageLoadingContent.CURRENT_REQUEST);
    if (imageRequest) {
      mimeType = imageRequest.mimeType;
      var image = imageRequest.image;
      if (image)
        numFrames = image.numFrames;
    }
  }

  if (!mimeType)
    mimeType = cachedType;

  // if we have a data url, get the MIME type from the url
  if (!mimeType && url.startsWith("data:")) {
    var dataMimeType = /^data:(image\/.*?)[;,]/i.exec(url);
    if (dataMimeType)
      mimeType = dataMimeType[1].toLowerCase();
  }

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

  if ((item instanceof HTMLLinkElement ||
       item instanceof HTMLInputElement ||
       item instanceof HTMLImageElement ||
       item instanceof SVGImageElement ||
      (item instanceof HTMLObjectElement && isImageType) ||
      (item instanceof HTMLEmbedElement && isImageType) ||
       isBG) && isProtocolAllowed) {
    newImage.setAttribute("src", url);
    physWidth = newImage.width || 0;
    physHeight = newImage.height || 0;

    if (item instanceof SVGImageElement) {
      newImage.width = item.width.baseVal.value;
      newImage.height = item.height.baseVal.value;
    }
    else if (!isBG) {
      // "width" and "height" attributes must be set to newImage,
      // even if there is no "width" or "height attribute in item;
      // otherwise, the preview image cannot be displayed correctly.
      newImage.width = ("width" in item && item.width) || newImage.naturalWidth;
      newImage.height = ("height" in item && item.height) || newImage.naturalHeight;
    }
    else {
      // the Width and Height of an HTML tag should not be used for its background image
      // (for example, "table" can have "width" or "height" attributes)
      newImage.width = newImage.naturalWidth;
      newImage.height = newImage.naturalHeight;
    }

    width = newImage.width;
    height = newImage.height;

    document.getElementById("theimagecontainer").collapsed = false
    document.getElementById("brokenimagecontainer").collapsed = true;
  }
  else if (item instanceof HTMLVideoElement && isProtocolAllowed) {
    newImage = document.createElementNS("http://www.w3.org/1999/xhtml", "video");
    newImage.id = "thepreviewimage";
    newImage.src = url;
    newImage.controls = true;
    width = physWidth = item.videoWidth;
    height = physHeight = item.videoHeight;

    document.getElementById("theimagecontainer").collapsed = false
    document.getElementById("brokenimagecontainer").collapsed = true;
  }
  else if (item instanceof HTMLAudioElement && isProtocolAllowed) {
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

  var imageSize = "";
  if (url && !isAudio) {
    if (width != physWidth || height != physHeight) {
      imageSize = gBundle.getFormattedString("mediaDimensionsScaled",
                                             [formatNumber(physWidth),
                                              formatNumber(physHeight),
                                              formatNumber(width),
                                              formatNumber(height)]);
    }
    else {
      imageSize = gBundle.getFormattedString("mediaDimensions",
                                             [formatNumber(width),
                                              formatNumber(height)]);
    }
  }
  setItemValue("imagedimensiontext", imageSize);

  makeBlockImage(url);

  oldImage.remove();
  imageContainer.appendChild(newImage);

  onImagePreviewShown.forEach(function(func) { func(); });
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

//******** Other Misc Stuff
// Modified from the Links Panel v2.3, http://segment7.net/mozilla/links/links.html
// parse a node to extract the contents of the node
function getValueText(node)
{
  var valueText = "";

  // form input elements don't generally contain information that is useful to our callers, so return nothing
  if (node instanceof HTMLInputElement ||
      node instanceof HTMLSelectElement ||
      node instanceof HTMLTextAreaElement)
    return valueText;

  // otherwise recurse for each child
  var length = node.childNodes.length;
  for (var i = 0; i < length; i++) {
    var childNode = node.childNodes[i];
    var nodeType = childNode.nodeType;

    // text nodes are where the goods are
    if (nodeType == Node.TEXT_NODE)
      valueText += " " + childNode.nodeValue;
    // and elements can have more text inside them
    else if (nodeType == Node.ELEMENT_NODE) {
      // images are special, we want to capture the alt text as if the image weren't there
      if (childNode instanceof HTMLImageElement)
        valueText += " " + getAltText(childNode);
      else
        valueText += " " + getValueText(childNode);
    }
  }

  return stripWS(valueText);
}

// Copied from the Links Panel v2.3, http://segment7.net/mozilla/links/links.html
// traverse the tree in search of an img or area element and grab its alt tag
function getAltText(node)
{
  var altText = "";

  if (node.alt)
    return node.alt;
  var length = node.childNodes.length;
  for (var i = 0; i < length; i++)
    if ((altText = getAltText(node.childNodes[i]) != undefined))  // stupid js warning...
      return altText;
  return "";
}

// strip leading and trailing whitespace, and replace multiple consecutive whitespace characters with a single space
function stripWS(text)
{
  return text.trim().replace(/\s+/g, " ");
}

function setItemValue(id, value)
{
  var item = document.getElementById(id);
  if (value) {
    item.disabled = false;
    item.value = value;
  }
  else
  {
    item.value = gStrings.notSet;
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
      view.performActionOnRow("copy", row);

      tmp = elem.getAttribute("copybuffer");
      if (tmp)
      {
        try {
          if (linksMode)
            urlSecurityCheck(tmp, gDocument.nodePrincipal);
          text.push(tmp);
        }
        catch (e) {
        }
      }
      elem.removeAttribute("copybuffer");
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
    if (gImageElement == gImageView.data[i][COL_IMAGE_NODE]) {
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
