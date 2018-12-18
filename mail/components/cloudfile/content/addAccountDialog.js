/* -*- Mode: javascript; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 ; js-indent-level: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var kFormId = "provider-form";

ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
ChromeUtils.import("resource:///modules/cloudFileAccounts.js");
ChromeUtils.defineModuleGetter(this, "ExtensionParent", "resource://gre/modules/ExtensionParent.jsm");

function createAccountObserver() {}

createAccountObserver.prototype = {
  QueryInterface: ChromeUtils.generateQI([Ci.nsIRequestObserver]),
  onStartRequest(aRequest, aContext) {},
  onStopRequest(aRequest, aContext, aStatusCode) {
    if (aStatusCode == Cr.NS_OK
        && aContext.QueryInterface(Ci.nsIMsgCloudFileProvider)) {
      let accountKey = aContext.accountKey;

      // For now, we'll just set the display name to be the name of the service
      cloudFileAccounts.setDisplayName(accountKey, aContext.displayName);

      window.arguments[0].accountKey = aContext.accountKey;
      window.close();
    } else {
      if (aContext.QueryInterface(Ci.nsIMsgCloudFileProvider)) {
        cloudFileAccounts.removeAccount(aContext.accountKey);
      } else {
        // Something went seriously wrong here...
        Cu.reportError("Cloud account creation failed, and " +
                       "provider instance missing!");
      }

      addAccountDialog._accept.disabled = false;
      addAccountDialog._messages.selectedPanel = addAccountDialog._error;
    }
  },
};

var addAccountDialog = {
  _settings: null,
  _settingsWrap: null,
  _accountType: null,
  _accept: null,
  _strings: Services.strings
                    .createBundle("chrome://messenger/locale/cloudfile/addAccountDialog.properties"),
  // This blacklist is for providers who no longer want to be offered
  // as an option for a new Filelink provider, but still wants to
  // exist as a Filelink provider for pre-existing users.
  _blacklist: new Set(["YouSendIt"]),

  onInit() {
    this._settings = document.getElementById("accountSettings");
    this._accountType = document.getElementById("accountType");
    this._noAccountText = document.getElementById("noAccountText");
    this._accept = document.documentElement.getButton("accept");
    this._cancel = document.documentElement.getButton("cancel");
    this._messages = document.getElementById("messages");
    this._authSpinner = document.getElementById("authorizing");
    this._error = document.getElementById("error");
    this._createAccountText = document.getElementById("createAccountText");

    this.removeTitleMenuItem();

    // Hook up the default "Learn More..." link to the appropriate link.
    let learnMore = this._settings
                        .contentDocument
                        .querySelector('#learn-more > a[href=""]');
    if (learnMore)
      learnMore.href = Services.prefs
                               .getCharPref("mail.cloud_files.learn_more_url");

    // Determine whether any account types were added to the menulist,
    // if not, return early.
    if (this.addAccountTypes() == 0)
      return;

    // Hook up the selection handler.
    this._accountType.addEventListener("select", this);
    // Also call it to run it for the default selection.
    addAccountDialog.accountTypeSelected();

    // The default emptySettings.xhtml is already loaded into the IFrame
    // at this point, before we could attach our DOMContentLoaded event
    // listener, so we'll call the function here manually.
    this.onIFrameLoaded(null);

    addAccountDialog.fitIFrame();
  },

  onUnInit() {
    // Clean-up the event listeners.
    this._settings.removeEventListener("DOMContentLoaded", this);
    this._settings.removeEventListener("overflow", this);
    this._accountType.removeEventListener("select", this);

    return true;
  },

  handleEvent(aEvent) {
    switch (aEvent.type) {
      case "DOMContentLoaded": {
        this.onIFrameLoaded();
        break;
      }
      case "overflow": {
        if (this._settings.contentDocument.body)
          this.fitIFrame();
        break;
      }
      case "select": {
        this.accountTypeSelected();
        break;
      }
    }
  },

  onIFrameLoaded(aEvent) {
    let doc = this._settings.contentDocument;

    let links = doc.getElementsByTagName("a");

    for (let link of links)
      link.addEventListener("click", this.onClickLink);

    let form = doc.getElementById(kFormId);

    if (form)
      form.addEventListener("input", this.onInput.bind(this));

    this.onInput();

    // Focus the first field in the form, if any, that does not have the
    // class "focus-filter".
    let firstField = doc.querySelector("form:not(.filter) input:not(.hidden)");
    if (firstField)
      firstField.focus();
  },

  fitIFrame() {
    // Determine the height of the accountSettings iframe, and adjust
    // the height of the window appropriately.

    // If no account is available, |.body| is undefined. In this case
    // return a minimum height of 16px without calling sizeToContent().
    if (!this._settings.contentDocument.body) {
      Cu.reportError("WARNING: addAccountDialog.js: fitFrame: There is no account and this._settings.contentDocument.body is undefined.");
      this._settings.style.height = this._settings.style.minHeight = "16px";
      return;
    }
    let newHeight = this._settings.contentDocument.body.offsetHeight;
    this._settings.style.height = this._settings.style.minHeight = newHeight + "px";
    window.sizeToContent();
  },

  /**
   * Displays the provider's settingsURL in a browser element, using a
   * chrome-privileged browser only if necessary.
   */
  setIFrameSource(src) {
    let type = src.startsWith("chrome:") ? "chrome" : "content";
    if (type == this._settings.getAttribute("type")) {
      this._settings.setAttribute("src", src);
      return;
    }

    let frame = document.createElement("browser");
    frame.setAttribute("class", "indent");
    frame.setAttribute("allowfullscreen", "false");
    frame.setAttribute("flex", "1");
    frame.setAttribute("type", type);

    // allows keeping dialog background color without hoops
    frame.setAttribute("transparent", "true");

    this._settings.parentNode.replaceChild(frame, this._settings);
    this._settings = frame;

    this._settings.addEventListener("DOMContentLoaded", this);
    this._settings.addEventListener("overflow", this);

    ExtensionParent.apiManager.emit("extension-browser-inserted", frame);

    frame.setAttribute("src", src);
  },

  removeTitleMenuItem() {
    let menuitem = this._accountType.querySelector('menuitem[value=""]');
    if (menuitem)
      menuitem.remove();
  },

  // Return number of additions to the menulist, zero if none happened.
  addAccountTypes() {
    let accountTypeTotal = 0;
    for (let [key, provider] of cloudFileAccounts.enumerateProviders()) {
      // If we already have an account for this type, don't add it to the list.
      // This limitation will hopefully be removed in the future.
      if (cloudFileAccounts.getAccountsForType(key).length > 0)
        continue;

      if (this._blacklist.has(key))
        continue;

      let menuitem = document.createElement("menuitem");
      menuitem.setAttribute("label", provider.displayName);
      menuitem.setAttribute("value", key);

      if (provider.iconClass) {
        menuitem.setAttribute("class", "menuitem-iconic menuitem-with-favicon");
        menuitem.setAttribute("image", provider.iconClass);
      }

      this._accountType.menupopup.appendChild(menuitem);
      accountTypeTotal++;
    }

    // This block should go away when bug 748437 gets fixed, since we'll
    // be able to add an arbitrary number of accounts for each account type.
    if (this._accountType.itemCount == 0) {
      this._createAccountText.hidden = true;
      this._accountType.hidden = true;
      this._accept.disabled = true;
      this._noAccountText.hidden = false;
      this._settings.classList.remove("indent");
      this._settings.classList.add("small-indent");
      this._cancel.focus();
    }

    // If there's only one option, let's choose it for the user to avoid
    // a few clicks.
    if (this._accountType.itemCount == 1)
      this._accountType.selectedIndex = 0;

    return accountTypeTotal;
  },

  onOK() {
    let accountType = this._accountType.value;
    let obs = new createAccountObserver();

    let extras = this.getExtraArgs();

    cloudFileAccounts.createAccount(accountType, obs, extras);
    this._accept.disabled = true;

    this._messages.selectedPanel = this._authSpinner;

    // Uninitialize the dialog before closing.
    this.onUnInit();
    return false;
  },

  getExtraArgs() {
    if (!this._settings)
      return {};

    if (this._settings.contentDocument.location.href.startsWith("moz-extension:")) {
      // WebExtensions use their own storage mechanism, don't use extraArgs from
      // their content document
      return {};
    }

    let func = this._settings.contentWindow
                   .wrappedJSObject
                   .extraArgs;
    if (!func)
      return {};

    return func();
  },

  accountTypeSelected() {
    let providerKey = this._accountType.selectedItem.value;
    if (!providerKey)
      return;

    let provider = cloudFileAccounts.getProviderForType(providerKey);
    if (!provider)
      return;

    // Reset the message display
    this._messages.selectedIndex = -1;

    // Load up the correct XHTML page for this provider.
    this.setIFrameSource(provider.settingsURL);
  },

  onClickLink(e) {
    e.preventDefault();
    let href = e.target.getAttribute("href");
    gProtocolService.loadURI(Services.io.newURI(href, "UTF-8"));
  },

  onInput() {
    // Let's see if we have everything we need to make OK enabled...
    if (this._accountType.selectedIndex == -1) {
      // We have the "Select a service provider" menuitem selected, so we
      // shouldn't be able to click "Set up account"
      this._accept.disabled = true;
    } else {
      this._accept.disabled = !this.checkValidity();
    }
  },

  checkValidity() {
    // If there's a form in the iframe, ensure that
    // it's checkValidity function passes.
    let form = this._settings
                   .contentWindow
                   .wrappedJSObject
                   .document
                   .getElementById(kFormId);

    if (form)
      return form.checkValidity();

    return true;
  },
};

XPCOMUtils.defineLazyServiceGetter(this, "gProtocolService",
                                   "@mozilla.org/uriloader/external-protocol-service;1",
                                   "nsIExternalProtocolService");
