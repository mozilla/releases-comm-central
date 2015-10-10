/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://gre/modules/AddonManager.jsm");

var PREF_EXTENSIONS_GETMOREMESSAGESTYLESURL = "extensions.getMoreMessageStylesURL";
var PREF_EXTENSIONS_GETMOREEMOTICONSURL     = "extensions.getMoreEmoticonsURL";

var gThemePane = {
  init: function (){
    AddonManager.getAllAddons(function(aAddons) {
      gThemePane.extensionList = aAddons;
      previewObserver.load();
      smileysPreview.load();
    });
    gThemePane.setGetMore("Emoticons");
    gThemePane.setGetMore("MessageStyles");
  },

  /* Set the correct URL for the "Get more ..."-links */
  setGetMore: function (aType){
    var prefURL;
    switch(aType){
      case "Emoticons":
        prefURL = PREF_EXTENSIONS_GETMOREEMOTICONSURL;
        break;
      case "MessageStyles":
        prefURL = PREF_EXTENSIONS_GETMOREMESSAGESTYLESURL;
        break;
      default:
        return;
    }

    var getMore = document.getElementById("getMore" + aType);
    var showGetMore = false;
    const nsIPrefBranch2 = Components.interfaces.nsIPrefBranch2;
    if (Services.prefs.getPrefType(prefURL) != nsIPrefBranch2.PREF_INVALID) {
      try {
        var getMoreURL = Components.classes["@mozilla.org/toolkit/URLFormatterService;1"]
                                   .getService(Components.interfaces.nsIURLFormatter)
                                   .formatURLPref(prefURL);
        getMore.setAttribute("getMoreURL", getMoreURL);
        showGetMore = getMoreURL != "about:blank";
      }
      catch (e) { }
    }
    getMore.hidden = !showGetMore;
  },

  /* Create the drop down list for emoticons and messagestyles;
      this will take care of disabled and incompatible themes and the case
      that there are no custom styles installed.
   */
  buildThemeList: function (aThemeType) {
    let extensionTypeRegExp = new RegExp("^" + aThemeType + "-");
    let themeList =
      this.getExtensionList()
          .filter(item => extensionTypeRegExp.test(item.id))
          .sort(function(item1, item2) {
            let name1 = item1.name.toLowerCase();
            let name2 = item2.name.toLowerCase();
            return name1 < name2 ? -1 : name1 > name2 ? 1 : 0;
          });
    if (!themeList.length)
      return;

    document.getElementById("no-" + aThemeType + "-menuitem")
            .setAttribute("hidden", "true");

    let themeNameRegExp = new RegExp("^" + aThemeType + "-([^@]+)@.*","");
    let themeBundle = document.getElementById("themesBundle");
    let menulist = document.getElementById(aThemeType + "-themename");
    themeList.forEach(function(aItem) {
      let label = aItem.name;
      if (aItem.userDisabled) {
        label += " " + themeBundle.getString("disabled");
      }
      else if (!aItem.isCompatible) {
        label += " " + themeBundle.getString("incompatible");
      }

      let item =
        menulist.appendItem(label, aItem.id.replace(themeNameRegExp, "$1"));

      // Set it to deactivated if it is not active;
      // this is independent from the reason displayed.
      if (!aItem.isActive || aItem.userDisabled)
        item.setAttribute("disabled", "true");
    });
  },

  openURL: function (aURL) {
    Components.classes["@mozilla.org/uriloader/external-protocol-service;1"]
              .getService(Components.interfaces.nsIExternalProtocolService)
              .loadUrl(Services.io.newURI(aURL, null, null));
  },

  // Getting the extension list is slow, return a cached copy of the list
  getExtensionList: function () {
    if (!this.extensionList)
      throw "The add-ons list should be loaded by now...";
    return this.extensionList;
  }
};
