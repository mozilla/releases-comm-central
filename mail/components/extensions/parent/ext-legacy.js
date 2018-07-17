/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.defineModuleGetter(this, "ChromeManifest", "resource:///modules/ChromeManifest.jsm");
ChromeUtils.defineModuleGetter(this, "ExtensionSupport", "resource:///modules/extensionSupport.jsm");
ChromeUtils.defineModuleGetter(this, "Overlays", "resource:///modules/Overlays.jsm");

Cu.importGlobalProperties(["fetch"]);

var { ExtensionError } = ExtensionUtils;

var loadedOnce = new Set();

this.legacy = class extends ExtensionAPI {
  async onManifestEntry(entryName) {
    if (this.extension.manifest.legacy) {
      await this.register();
    }
  }

  async register() {
    let enumerator = Services.wm.getEnumerator("mail:3pane");
    if (enumerator.hasMoreElements() && enumerator.getNext().document.readyState == "complete") {
      // It's too late!
      console.log(`Legacy WebExtension ${this.extension.id} loading after app startup, refusing to load immediately.`);
      return;
    }

    this.extension.legacyLoaded = true;

    if (loadedOnce.has(this.extension.id)) {
      console.log(`Legacy WebExtension ${this.extension.id} has already been loaded in this run, refusing to do so again. Please restart`);
      return;
    }
    loadedOnce.add(this.extension.id);


    let extensionRoot;
    if (this.extension.rootURI instanceof Ci.nsIJARURI) {
      extensionRoot = this.extension.rootURI.JARFile.QueryInterface(Ci.nsIFileURL).file;
      console.log("Loading packed extension from", extensionRoot.path);
    } else {
      extensionRoot = this.extension.rootURI.QueryInterface(Ci.nsIFileURL).file;
      console.log("Loading unpacked extension from", extensionRoot.path);
    }

    // Have Gecko do as much loading as is still possible
    try {
      Cc["@mozilla.org/component-manager-extra;1"]
        .getService(Ci.nsIComponentManagerExtra)
        .addLegacyExtensionManifestLocation(extensionRoot);
    } catch (e) {
      throw new ExtensionError(e.message, e.fileName, e.lineNumber);
    }

    // Load chrome.manifest
    let appinfo = Services.appinfo;
    let options = {
      application: appinfo.ID,
      appversion: appinfo.version,
      platformversion: appinfo.platformVersion,
      os: appinfo.OS,
      osversion: Services.sysinfo.getProperty("version"),
      abi: appinfo.XPCOMABI
    };
    let loader = async (filename) => {
      let url = this.extension.getURL(filename);
      return fetch(url).then(response => response.text());
    };
    let chromeManifest = new ChromeManifest(loader, options);
    await chromeManifest.parse("chrome.manifest");

    // Load preference files
    console.log("Loading add-on preferences from ", extensionRoot.path);
    ExtensionSupport.loadAddonPrefs(extensionRoot);

    // Fire profile-after-change notifications, because we are past that event by now
    console.log("Firing profile-after-change listeners for", this.extension.id);
    let profileAfterChange = chromeManifest.category.get("profile-after-change");
    for (let contractid of profileAfterChange.values()) {
      let service = contractid.startsWith("service,");
      let instance;
      try {
        if (service) {
          instance = Components.classes[contractid.substr(8)].getService(Ci.nsIObserver);
        } else {
          instance = Components.classes[contractid].createInstance(Ci.nsIObserver);
        }

        instance.observe(null, "profile-after-change", null);
      } catch (e) {
        console.error("Error firing profile-after-change listener for", contractid);
      }
    }

    let documentObserver = {
      observe(document) {
        if (ExtensionCommon.instanceOf(document, "XULDocument")) {
          Overlays.load(chromeManifest, document.defaultView);
        }
      }
    };
    Services.obs.addObserver(documentObserver, "chrome-document-loaded");

    this.extension.callOnClose({
      close: () => {
        Services.obs.removeObserver(documentObserver, "chrome-document-loaded");
      }
    });
  }
};
