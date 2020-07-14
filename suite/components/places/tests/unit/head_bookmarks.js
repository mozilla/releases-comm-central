/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");

// Import common head.
var commonFile = do_get_file("../head_common.js", false);
var uri = Services.io.newFileURI(commonFile);
Services.scriptloader.loadSubScript(uri.spec, this);

// Put any other stuff relative to this test folder below.


XPCOMUtils.defineLazyGetter(this, "PlacesUIUtils", function() {
  const {PlacesUIUtils} = ChromeUtils.import("resource:///modules/PlacesUIUtils.jsm");
  return PlacesUIUtils;
});


const ORGANIZER_FOLDER_ANNO = "PlacesOrganizer/OrganizerFolder";
const ORGANIZER_QUERY_ANNO = "PlacesOrganizer/OrganizerQuery";


// Needed by some test that relies on having an app  registered.
ChromeUtils.import("resource://testing-common/AppInfo.jsm", this);
updateAppInfo({
  name: "PlacesTest",
  ID: "{230de50e-4cd1-11dc-8314-0800200c9a66}",
  version: "1",
  platformVersion: "",
});

// Smart bookmarks constants.
const SMART_BOOKMARKS_VERSION = 4;
// 1 = "Most Visited".
const SMART_BOOKMARKS_ON_TOOLBAR = 1;
// 3 = "Recently Bookmarked", "Recent Tags", separator.
const SMART_BOOKMARKS_ON_MENU = 3; // Takes in count the additional separator.

// Default bookmarks constants.
// 4 =  "SeaMonkey", "mozilla.org", "mozillaZine".
const DEFAULT_BOOKMARKS_ON_TOOLBAR = 3;
// 2 = "SeaMonkey and Mozilla", "Search the Web".
const DEFAULT_BOOKMARKS_ON_MENU = 3; // Takes in count the additional separator.
