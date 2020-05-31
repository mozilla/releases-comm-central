/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { CardDAVDirectory } = ChromeUtils.import(
  "resource:///modules/CardDAVDirectory.jsm"
);

var gUrl;
var gUsername;
var gPassword;

var uiElements = {};

window.addEventListener("DOMContentLoaded", async () => {
  for (let id of [
    "dialog",
    "url",
    "username",
    "password",
    "rememberPassword",
    "statusArea",
    "statusMessage",
    "resultsArea",
    "availableBooks",
  ]) {
    uiElements[id] = document.getElementById("carddav-" + id);
  }

  await document.l10n.ready;

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
  other.setAttribute("data-l10n-id", "carddav-provider-option-other");
  provider.appendChild(other);

  uiElements.url.value = provider.value;
});

function handleChangeProvider(event) {
  uiElements.url.value = event.target.value;
  changeCardDAVURL(uiElements.url.value);
}

function handleCardDAVURLInput(event) {
  changeCardDAVURL(event.target.value);
}

function changeCardDAVURL(value) {
  setStatus();
  uiElements.resultsArea.hidden = true;
  gUrl = uiElements.url.value.trim();
  if (gUrl && !gUrl.match(/^https?:\/\//)) {
    gUrl = "https://" + gUrl;
  }
  gUrl = gUrl ? new URL(gUrl) : "";
}

async function check() {
  gUrl = uiElements.url.value;
  gUsername = uiElements.username.value;
  gPassword = uiElements.password.value;

  setStatus("loading", "carddav-loading");

  try {
    if (!gUrl.match(/^https?:\/\//)) {
      gUrl = "https://" + gUrl;
    }
    gUrl = new URL(gUrl);

    let response = await CardDAVDirectory.makeRequest(
      `${gUrl.origin}/.well-known/carddav`,
      {
        method: "PROPFIND",
        headers: {
          "Content-Type": "text/xml",
          Depth: 0,
        },
        body: `<propfind xmlns="DAV:">
        <prop>
          <current-user-principal/>
        </prop>
      </propfind>`,
      }
    );
    let href =
      gUrl.origin +
      response.dom.querySelector("current-user-principal href").textContent;

    response = await CardDAVDirectory.makeRequest(href, {
      method: "PROPFIND",
      headers: {
        "Content-Type": "text/xml",
        Depth: 0,
      },
      body: `<propfind xmlns="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
        <prop>
          <card:addressbook-home-set/>
        </prop>
      </propfind>`,
    });
    href =
      gUrl.origin +
      response.dom.querySelector("addressbook-home-set href").textContent;

    response = await CardDAVDirectory.makeRequest(href, {
      method: "PROPFIND",
      headers: {
        "Content-Type": "text/xml",
        Depth: 1,
      },
      body: `<propfind xmlns="DAV:" xmlns:cs="http://calendarserver.org/ns/">
        <prop>
          <resourcetype/>
          <displayname/>
          <cs:getctag/>
        </prop>
      </propfind>`,
    });

    while (uiElements.availableBooks.lastChild) {
      uiElements.availableBooks.lastChild.remove();
    }

    let existing = [...MailServices.ab.directories].map(d =>
      d.getStringValue("carddav.url", "")
    );
    let alreadyAdded = 0;
    for (let r of response.dom.querySelectorAll("response")) {
      if (r.querySelector("resourcetype addressbook")) {
        let bookURL = new URL(r.querySelector("href").textContent, gUrl).href;
        if (existing.includes(bookURL)) {
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
        checkbox.value = bookURL;
      }
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
    setStatus("error", "carddav-connection-error");
  }
}

function setStatus(status, message) {
  uiElements.dialog.getButton("accept").disabled = status == "error";
  if (status) {
    uiElements.statusArea.setAttribute("status", status);
    document.l10n.setAttributes(uiElements.statusMessage, message);
    window.sizeToContent();
  } else {
    uiElements.statusArea.removeAttribute("status");
    document.l10n.setAttributes(uiElements.statusMessage, null);
  }
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

  let newLoginInfo = Cc[
    "@mozilla.org/login-manager/loginInfo;1"
  ].createInstance(Ci.nsILoginInfo);
  newLoginInfo.init(gUrl.origin, null, "CardDAV", gUsername, gPassword, "", "");
  // TODO: Login might exist.
  Services.logins.addLogin(newLoginInfo);

  let book;
  for (let checkbox of uiElements.availableBooks.children) {
    if (checkbox.checked) {
      let dirPrefId = MailServices.ab.newAddressBook(
        checkbox.getAttribute("label"),
        null,
        102,
        null
      );
      book = MailServices.ab.getDirectoryFromId(dirPrefId);
      book.setStringValue("carddav.url", checkbox.value);

      let dir = CardDAVDirectory.forFile(book.fileName);
      dir.fetchAllFromServer();
    }
  }
});
