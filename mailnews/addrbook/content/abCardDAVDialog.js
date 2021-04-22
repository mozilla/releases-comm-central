/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { ConsoleAPI } = ChromeUtils.import("resource://gre/modules/Console.jsm");
var { DNS } = ChromeUtils.import("resource:///modules/DNS.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  CardDAVDirectory: "resource:///modules/CardDAVDirectory.jsm",
  ContextualIdentityService:
    "resource://gre/modules/ContextualIdentityService.jsm",
  OAuth2: "resource:///modules/OAuth2.jsm",
  OAuth2Providers: "resource:///modules/OAuth2Providers.jsm",
});

var console = new ConsoleAPI();
console.prefix = "CardDAV setup";

var oAuth = null;
var authInfo = null;
var uiElements = {};
var userContextId;

// Use presets only where DNS discovery fails. Set to null to prevent
// auto-fill completely for a domain.
const PRESETS = {
  // For testing purposes.
  "bad.invalid": null,
  // Google responds correctly but the provided address returns 404.
  "gmail.com": "https://www.googleapis.com",
  "googlemail.com": "https://www.googleapis.com",
  // For testing purposes.
  "test.invalid": "http://localhost:9999",
  // Yahoo! OAuth is not working yet.
  "yahoo.com": null,
};

window.addEventListener(
  "DOMContentLoaded",
  async () => {
    for (let id of [
      "username",
      "location",
      "statusArea",
      "statusMessage",
      "resultsArea",
      "availableBooks",
    ]) {
      uiElements[id] = document.getElementById("carddav-" + id);
    }

    await document.l10n.ready;
    fillLocationPlaceholder();
  },
  { once: true }
);

/**
 * Update the placeholder text for the network location field. If the username
 * is a valid email address use the domain part of the username, otherwise use
 * the default placeholder.
 */
function fillLocationPlaceholder() {
  let parts = uiElements.username.value.split("@");
  let domain = parts.length == 2 && parts[1] ? parts[1] : null;

  if (domain) {
    uiElements.location.setAttribute("placeholder", domain);
  } else {
    uiElements.location.setAttribute(
      "placeholder",
      uiElements.location.getAttribute("default-placeholder")
    );
  }
}

function handleCardDAVURLInput(event) {
  changeCardDAVURL();
}

function changeCardDAVURL() {
  setStatus();
  uiElements.resultsArea.hidden = true;
}

function handleCardDAVURLBlur(event) {
  if (
    uiElements.location.validity.typeMismatch &&
    !uiElements.location.value.match(/^https?:\/\//)
  ) {
    uiElements.location.value = `https://${uiElements.location.value}`;
  }
}

async function check() {
  // We might be accepting the dialog by pressing Enter in the URL input.
  handleCardDAVURLBlur();

  let username = uiElements.username.value;

  if (!uiElements.location.validity.valid && !username.split("@")[1]) {
    console.error(`Invalid URL: "${uiElements.location.value}"`);
    return;
  }

  setStatus("loading", "carddav-loading");
  while (uiElements.availableBooks.lastChild) {
    uiElements.availableBooks.lastChild.remove();
  }

  // Use a unique context for each attempt, so a prompt is always shown.
  userContextId = Math.floor(Date.now() / 1000);

  try {
    let url = uiElements.location.value || username.split("@")[1];
    if (url in PRESETS) {
      if (PRESETS[url] === null) {
        // Let the code handle the first status-changed event before firing
        // another. This isn't necessary for the front-end but saves a lot of
        // messing around to make the tests work.
        await new Promise(r => setTimeout(r));

        console.error(`${url} is known to be incompatible`);
        setStatus("error", "carddav-known-incompatible", { url });
        return;
      }
      console.log(`Using preset URL for ${url}`);
      url = PRESETS[url];
    } else if (!url.match(/^https?:\/\//)) {
      url = "https://" + url;
    }

    url = new URL(url);
    if (url.pathname == "/" && !(url.hostname in PRESETS)) {
      console.log(`Looking up DNS record for ${url.hostname}`);
      let srvRecords = await DNS.srv(`_carddavs._tcp.${url.hostname}`);
      srvRecords.sort((a, b) => a.prio - b.prio || b.weight - a.weight);

      if (srvRecords[0]) {
        url = new URL(`https://${srvRecords[0].host}`);

        let txtRecords = await DNS.txt(`_carddavs._tcp.${srvRecords[0].host}`);
        txtRecords.sort((a, b) => a.prio - b.prio || b.weight - a.weight);
        txtRecords = txtRecords.filter(result =>
          result.data.startsWith("path=")
        );

        if (txtRecords[0]) {
          url.pathname = txtRecords[0].data.substr(5);
        }
      }
    }

    oAuth = null;
    authInfo = null;

    let requestParams = {
      method: "PROPFIND",
      username,
      userContextId,
      headers: {
        Depth: 0,
      },
      body: `<propfind xmlns="DAV:">
          <prop>
            <resourcetype/>
            <displayname/>
          </prop>
        </propfind>`,
    };

    let details = OAuth2Providers.getHostnameDetails(url.host);
    if (details) {
      let [issuer, scope] = details;
      let [
        clientId,
        clientSecret,
        authorizationEndpoint,
        tokenEndpoint,
      ] = OAuth2Providers.getIssuerDetails(issuer);

      oAuth = new OAuth2(
        authorizationEndpoint,
        tokenEndpoint,
        scope,
        clientId,
        clientSecret
      );
      oAuth._loginOrigin = `oauth://${issuer}`;
      oAuth._scope = scope;
      if (username) {
        oAuth.extraAuthParams = [["login_hint", username]];
      }

      // Implement msgIOAuth2Module.connect, which CardDAV.makeRequest expects.
      requestParams.oAuth = {
        QueryInterface: ChromeUtils.generateQI(["msgIOAuth2Module"]),
        connect(withUI, listener) {
          oAuth.connect(
            () =>
              listener.onSuccess(
                // String format based on what OAuth2Module has.
                btoa(`\x01auth=Bearer ${oAuth.accessToken}`)
              ),
            () => listener.onFailure(Cr.NS_ERROR_ABORT),
            withUI,
            false
          );
        },
      };
    }

    let response;
    let triedURLs = new Set();
    async function tryURL(url) {
      if (triedURLs.has(url)) {
        return;
      }
      triedURLs.add(url);

      console.log(`Attempting to connect to ${url}`);
      response = await CardDAVDirectory.makeRequest(url, requestParams);
      if (response.status == 207 && response.dom) {
        console.log(`${url} ... success`);
        // The first successful response should have the username and password
        // that the user entered. Save these for later.
        authInfo = authInfo || response.authInfo;
      } else {
        console.log(
          `${url} ... response was "${response.status} ${response.statusText}"`
        );
        response = null;
      }
    }

    if (url.pathname != "/") {
      // This might be the full URL of an address book.
      await tryURL(url.href);
      if (!response?.dom?.querySelector("resourcetype addressbook")) {
        response = null;
      }
    }
    if (!response || !response.dom) {
      // Auto-discovery using a magic URL.
      requestParams.body = `<propfind xmlns="DAV:">
        <prop>
          <current-user-principal/>
        </prop>
      </propfind>`;
      await tryURL(`${url.origin}/.well-known/carddav`);
    }
    if (!response) {
      // Auto-discovery at the root of the domain.
      await tryURL(`${url.origin}/`);
    }
    if (!response) {
      // We've run out of ideas.
      throw new Components.Exception(
        "Address book discovery failed",
        Cr.NS_ERROR_FAILURE
      );
    }

    if (!response.dom.querySelector("resourcetype addressbook")) {
      // Steps two and three of auto-discovery. If the entered URL did point
      // to an address book, we won't get here.
      url = new URL(
        response.dom.querySelector("current-user-principal href").textContent,
        url
      );
      requestParams.body = `<propfind xmlns="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
        <prop>
          <card:addressbook-home-set/>
        </prop>
      </propfind>`;
      await tryURL(url.href);

      url = new URL(
        response.dom.querySelector("addressbook-home-set href").textContent,
        url
      );
      requestParams.headers.Depth = 1;
      requestParams.body = `<propfind xmlns="DAV:">
        <prop>
          <resourcetype/>
          <displayname/>
        </prop>
      </propfind>`;
      await tryURL(url.href);
    }

    // Find any directories in the response and add them to the UI.

    let existing = MailServices.ab.directories.map(d =>
      d.getStringValue("carddav.url", "")
    );
    let alreadyAdded = 0;
    for (let r of response.dom.querySelectorAll("response")) {
      if (r.querySelector("status")?.textContent != "HTTP/1.1 200 OK") {
        continue;
      }
      if (!r.querySelector("resourcetype addressbook")) {
        continue;
      }

      let bookURL = new URL(r.querySelector("href").textContent, url);
      if (existing.includes(bookURL.href)) {
        alreadyAdded++;
        continue;
      }
      let checkbox = uiElements.availableBooks.appendChild(
        document.createXULElement("checkbox")
      );
      checkbox.setAttribute(
        "label",
        r.querySelector("displayname").textContent
      );
      checkbox.checked = true;
      checkbox.value = bookURL.href;
    }

    if (uiElements.availableBooks.childElementCount == 0) {
      if (alreadyAdded > 0) {
        setStatus("error", "carddav-already-added");
      } else {
        setStatus("error", "carddav-none-found");
      }
    } else {
      uiElements.resultsArea.hidden = false;
      setStatus();
    }
  } catch (ex) {
    console.error(ex);
    setStatus("error", "carddav-connection-error");
  }
}

function setStatus(status, message, args) {
  for (let b of document.querySelectorAll("#carddav-provider-list button")) {
    b.disabled = status == "loading";
  }
  uiElements.location.disabled = status == "loading";

  if (status) {
    uiElements.statusArea.setAttribute("status", status);
    document.l10n.setAttributes(uiElements.statusMessage, message, args);
    window.sizeToContent();
  } else {
    uiElements.statusArea.removeAttribute("status");
    uiElements.statusMessage.removeAttribute("data-l10n-id");
    uiElements.statusMessage.textContent = "";
  }
  window.dispatchEvent(new CustomEvent("status-changed"));
}

window.addEventListener("dialogaccept", event => {
  if (uiElements.resultsArea.hidden) {
    event.preventDefault();
    check();
    return;
  }

  if (uiElements.availableBooks.childElementCount == 0) {
    return;
  }

  let book;
  for (let checkbox of uiElements.availableBooks.children) {
    if (checkbox.checked) {
      let dirPrefId = MailServices.ab.newAddressBook(
        checkbox.getAttribute("label"),
        null,
        Ci.nsIAbManager.CARDDAV_DIRECTORY_TYPE,
        null
      );
      book = MailServices.ab.getDirectoryFromId(dirPrefId);
      book.setStringValue("carddav.url", checkbox.value);
      window.arguments[0].newDirectoryURI = book.URI;

      if (oAuth) {
        let newLoginInfo = Cc[
          "@mozilla.org/login-manager/loginInfo;1"
        ].createInstance(Ci.nsILoginInfo);
        newLoginInfo.init(
          oAuth._loginOrigin,
          null,
          oAuth._scope,
          book.UID,
          oAuth.refreshToken,
          "",
          ""
        );
        Services.logins.addLogin(newLoginInfo);
      } else if (authInfo?.username) {
        book.setStringValue("carddav.username", authInfo.username);
        authInfo.save();
      }

      let dir = CardDAVDirectory.forFile(book.fileName);
      // Pass the context to the created address book. This prevents asking
      // for a username/password again in the case that we didn't save it.
      // The user won't be prompted again until Thunderbird is restarted.
      dir._userContextId = userContextId;
      dir.fetchAllFromServer();
    }
  }
});
