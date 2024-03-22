/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals openAccountSetupTabWithAccount, openAccountProvisionerTab */

/**
 * This object takes care of intercepting page loads and creating the
 * corresponding account if the page load turns out to be a text/xml file from
 * one of our account providers.
 */

var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);
var { NetUtil } = ChromeUtils.importESModule(
  "resource://gre/modules/NetUtil.sys.mjs"
);
var { JXON } = ChromeUtils.importESModule("resource:///modules/JXON.sys.mjs");

/**
 * This is an observer that watches all HTTP requests for one where the
 * response contentType contains text/xml.  Once that observation is
 * made, we ensure that the associated window for that request matches
 * the window belonging to the content tab for the account order form.
 * If so, we attach an nsITraceableListener to read the contents of the
 * request response, and react accordingly if the contents can be turned
 * into an email account.
 *
 * @param aBrowser The XUL <browser> the request lives in.
 * @param aParams An object containing various bits of information.
 * @param aParams.realName The real name of the person
 * @param aParams.email The email address the person picked.
 * @param aParams.searchEngine The search engine associated to that provider.
 */
function httpRequestObserver(aBrowser, aParams) {
  this.browser = aBrowser;
  this.params = aParams;
}

httpRequestObserver.prototype = {
  observe(aSubject, aTopic) {
    if (
      aTopic != "http-on-examine-response" &&
      aTopic != "http-on-examine-cached-response"
    ) {
      return;
    }

    if (!(aSubject instanceof Ci.nsIHttpChannel)) {
      console.error(
        "Failed to get a nsIHttpChannel when " +
          "observing http-on-examine-response"
      );
      return;
    }
    // Helper function to get header values.
    const getHttpHeader = (httpChannel, header) => {
      // getResponseHeader throws when header is not set.
      try {
        return httpChannel.getResponseHeader(header);
      } catch (e) {
        return null;
      }
    };

    const contentType = getHttpHeader(aSubject, "Content-Type");
    if (!contentType || !contentType.toLowerCase().startsWith("text/xml")) {
      return;
    }

    // It's possible the account information changed during the setup at the
    // provider. Check some headers and set them if needed.
    const name = getHttpHeader(aSubject, "x-thunderbird-account-name");
    if (name) {
      this.params.realName = name;
    }
    const email = getHttpHeader(aSubject, "x-thunderbird-account-email");
    if (email) {
      this.params.email = email;
    }

    const requestWindow = this._getWindowForRequest(aSubject);
    if (!requestWindow || requestWindow !== this.browser.innerWindowID) {
      return;
    }

    // Ok, we've got a request that looks like a decent candidate.
    // Let's attach our TracingListener.
    if (aSubject instanceof Ci.nsITraceableChannel) {
      const newListener = new TracingListener(this.browser, this.params);
      newListener.oldListener = aSubject.setNewListener(newListener);
    }
  },

  /**
   * _getWindowForRequest is an internal function that takes an nsIRequest,
   * and returns the associated window for that request.  If it cannot find
   * an associated window, the function returns null. On exception, the
   * exception message is logged to the Error Console and null is returned.
   *
   * @param aRequest the nsIRequest to analyze
   */
  _getWindowForRequest(aRequest) {
    try {
      if (aRequest && aRequest.notificationCallbacks) {
        return aRequest.notificationCallbacks.getInterface(Ci.nsILoadContext)
          .currentWindowContext.innerWindowId;
      }
      if (
        aRequest &&
        aRequest.loadGroup &&
        aRequest.loadGroup.notificationCallbacks
      ) {
        return aRequest.loadGroup.notificationCallbacks.getInterface(
          Ci.nsILoadContext
        ).currentWindowContext.innerWindowId;
      }
    } catch (e) {
      console.error(
        "Could not find an associated window " +
          "for an HTTP request. Error: " +
          e
      );
    }
    return null;
  },

  QueryInterface: ChromeUtils.generateQI(["nsIObserver"]),
};

/**
 * TracingListener is an nsITracableChannel implementation that copies
 * an incoming stream of data from a request.  The data flows through this
 * nsITracableChannel transparently to the original listener. Once the
 * response data is fully downloaded, an attempt is made to parse it
 * as XML, and derive email account data from it.
 *
 * @param aBrowser The XUL <browser> the request lives in.
 * @param aParams An object containing various bits of information.
 * @param aParams.realName The real name of the person
 * @param aParams.email The email address the person picked.
 * @param aParams.searchEngine The search engine associated to that provider.
 */
function TracingListener(aBrowser, aParams) {
  this.chunks = [];
  this.browser = aBrowser;
  this.params = aParams;
  this.oldListener = null;
}

TracingListener.prototype = {
  onStartRequest(/* nsIRequest */ aRequest) {
    this.oldListener.onStartRequest(aRequest);
  },

  async onStopRequest(/* nsIRequest */ aRequest, /* int */ aStatusCode) {
    const { CreateInBackend } = ChromeUtils.importESModule(
      "resource:///modules/accountcreation/CreateInBackend.sys.mjs"
    );
    const { readFromXML } = ChromeUtils.importESModule(
      "resource:///modules/accountcreation/readFromXML.sys.mjs"
    );
    const { AccountConfig } = ChromeUtils.importESModule(
      "resource:///modules/accountcreation/AccountConfig.sys.mjs"
    );

    let newAccount;
    try {
      // Construct the downloaded data (we'll assume UTF-8 bytes) into XML.
      let xml = this.chunks.join("");
      const bytes = new Uint8Array(xml.length);
      for (let i = 0; i < xml.length; i++) {
        bytes[i] = xml.charCodeAt(i);
      }
      xml = new TextDecoder().decode(bytes);

      // Attempt to derive email account information.
      const domParser = new DOMParser();
      const accountConfig = readFromXML(
        JXON.build(domParser.parseFromString(xml, "text/xml"))
      );
      AccountConfig.replaceVariables(
        accountConfig,
        this.params.realName,
        this.params.email
      );

      const host = aRequest.getRequestHeader("Host");
      const providerHostname = new URL("http://" + host).hostname;
      // Collect telemetry on which provider the new address was purchased from.
      Services.telemetry.keyedScalarAdd(
        "tb.account.new_account_from_provisioner",
        providerHostname,
        1
      );

      // Create the new account in the back end.
      newAccount = await CreateInBackend.createAccountInBackend(accountConfig);

      const tabmail = document.getElementById("tabmail");
      // Find the tab associated with this browser, and close it.
      const myTabInfo = tabmail.tabInfo.filter(
        function (x) {
          return "browser" in x && x.browser == this.browser;
        }.bind(this)
      )[0];
      tabmail.closeTab(myTabInfo);

      // Trigger the first login to download the folder structure and messages.
      newAccount.incomingServer.getNewMessages(
        newAccount.incomingServer.rootFolder,
        this._msgWindow,
        null
      );
    } catch (e) {
      // Something went wrong with account set up. Dump the error out to the
      // error console, reopen the account provisioner tab, and show an error
      // dialog to the user.
      console.error("Problem interpreting provider XML:" + e);
      openAccountProvisionerTab();
      Services.prompt.alert(window, null, e);

      this.oldListener.onStopRequest(aRequest, aStatusCode);
      return;
    }

    // Open the account setup tab and show the success view or an error if we
    // weren't able to create the new account.
    openAccountSetupTabWithAccount(
      newAccount,
      this.params.realName,
      this.params.email
    );

    this.oldListener.onStopRequest(aRequest, aStatusCode);
  },

  onDataAvailable(
    /* nsIRequest */ aRequest,
    /* nsIInputStream */ aStream,
    /* int */ aOffset,
    /* int */ aCount
  ) {
    // We want to read the stream of incoming data, but we also want
    // to make sure it gets passed to the original listener. We do this
    // by passing the input stream through an nsIStorageStream, writing
    // the data to that stream, and passing it along to the next listener.
    const binaryInputStream = Cc[
      "@mozilla.org/binaryinputstream;1"
    ].createInstance(Ci.nsIBinaryInputStream);
    const storageStream = Cc["@mozilla.org/storagestream;1"].createInstance(
      Ci.nsIStorageStream
    );
    const outStream = Cc["@mozilla.org/binaryoutputstream;1"].createInstance(
      Ci.nsIBinaryOutputStream
    );

    binaryInputStream.setInputStream(aStream);

    // The segment size of 8192 is a little magical - more or less
    // copied from nsITraceableChannel example code strewn about the
    // web.
    storageStream.init(8192, aCount, null);
    outStream.setOutputStream(storageStream.getOutputStream(0));

    const data = binaryInputStream.readBytes(aCount);
    this.chunks.push(data);

    outStream.writeBytes(data, aCount);
    this.oldListener.onDataAvailable(
      aRequest,
      storageStream.newInputStream(0),
      aOffset,
      aCount
    );
  },

  QueryInterface: ChromeUtils.generateQI([
    "nsIStreamListener",
    "nsIRequestObserver",
  ]),
};
