/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { CardDAVDirectory } = ChromeUtils.import(
  "resource:///modules/CardDAVDirectory.jsm"
);
var { ConsoleAPI } = ChromeUtils.import("resource://gre/modules/Console.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

var console = new ConsoleAPI();
console.prefix = "CardDAV setup";

var authInfo = null;
var uiElements = {};

window.addEventListener("DOMContentLoaded", async () => {
  for (let id of [
    "dialog",
    "url",
    "statusArea",
    "statusMessage",
    "resultsArea",
    "availableBooks",
  ]) {
    uiElements[id] = document.getElementById("carddav-" + id);
  }

  await document.l10n.ready;
  /*
  let presets = {
    Fastmail: "https://carddav.fastmail.com",
    Google: "https://www.googleapis.com",
  };
  // TODO: Only load presets of accounts we have.
  let provider = document.getElementById("carddav-provider");
  for (let [label, hostname] of Object.entries(presets)) {
    let option = document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "option"
    );
    option.label = label;
    option.value = hostname;
    provider.appendChild(option);
  }
  let other = document.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "option"
  );
  other.value = "";
  document.l10n.setAttributes(other, "carddav-provider-option-other");
  provider.appendChild(other);

  uiElements.url.value = provider.value;
  */
});

function handleChangeProvider(event) {
  uiElements.url.value = event.target.value;
  changeCardDAVURL();
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
    uiElements.url.validity.typeMismatch &&
    !uiElements.url.value.match(/^https?:\/\//)
  ) {
    uiElements.url.value = `https://${uiElements.url.value}`;
  }
}

async function check() {
  // We might be accepting the dialog by pressing Enter in the URL input.
  handleCardDAVURLBlur();

  if (!uiElements.url.validity.valid) {
    console.error(`Invalid URL: "${uiElements.url.value}"`);
    return;
  }

  setStatus("loading", "carddav-loading");
  while (uiElements.availableBooks.lastChild) {
    uiElements.availableBooks.lastChild.remove();
  }

  // Use a unique context for each attempt, so a prompt is always shown.
  let privateBrowsingID = Math.floor(Date.now() / 1000);

  try {
    let url = uiElements.url.value;
    if (!url.match(/^https?:\/\//)) {
      url = "https://" + url;
    }
    url = new URL(url);
    authInfo = null;

    let response;

    let requestParams = {
      method: "PROPFIND",
      privateBrowsingID,
      headers: {
        Depth: 0,
      },
      body: `<propfind xmlns="DAV:">
          <prop>
            <resourcetype/>
            <displayname/>
          </prop>
        </propfind>`,
      shouldSaveAuth: false,
    };

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
    Cu.reportError(ex);
    setStatus("error", "carddav-connection-error");
  }
}

function setStatus(status, message) {
  if (status) {
    uiElements.statusArea.setAttribute("status", status);
    document.l10n.setAttributes(uiElements.statusMessage, message);
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

      if (authInfo?.username) {
        book.setStringValue("carddav.username", authInfo.username);
        authInfo.save();
      }

      let dir = CardDAVDirectory.forFile(book.fileName);
      dir.fetchAllFromServer();
    }
  }
});
