/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.defineESModuleGetters(this, {
  CardDAVUtils: "resource:///modules/CardDAVUtils.sys.mjs",
  MailServices: "resource:///modules/MailServices.sys.mjs",
});

var log = console.createInstance({
  prefix: "carddav.setup",
  maxLogLevel: "Warn",
  maxLogLevelPref: "carddav.setup.loglevel",
});

var oAuth = null;
var callbacks = null;
var uiElements = {};
var userContextId;

window.addEventListener(
  "DOMContentLoaded",
  () => {
    for (const id of [
      "username",
      "location",
      "statusArea",
      "statusImage",
      "statusMessage",
      "resultsArea",
      "availableBooks",
    ]) {
      uiElements[id] = document.getElementById("carddav-" + id);
    }
  },
  { once: true }
);
window.addEventListener(
  "DOMContentLoaded",
  async () => {
    await document.l10n.translateRoots();
    fillLocationPlaceholder();
    setStatus();
  },
  { once: true }
);

/**
 * Update the placeholder text for the network location field. If the username
 * is a valid email address use the domain part of the username, otherwise use
 * the default placeholder.
 */
function fillLocationPlaceholder() {
  const parts = uiElements.username.value.split("@");
  const domain = parts.length == 2 && parts[1] ? parts[1] : null;

  if (domain) {
    uiElements.location.setAttribute("placeholder", domain);
  } else {
    uiElements.location.setAttribute(
      "placeholder",
      uiElements.location.getAttribute("default-placeholder")
    );
  }
}

function handleCardDAVURLInput() {
  changeCardDAVURL();
}

function changeCardDAVURL() {
  uiElements.resultsArea.hidden = true;
  setStatus();
}

function handleCardDAVURLBlur() {
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

  const username = uiElements.username.value;

  if (!uiElements.location.validity.valid && !username.split("@")[1]) {
    log.error(`Invalid URL: "${uiElements.location.value}"`);
    return;
  }

  let url = uiElements.location.value || username.split("@")[1];
  if (!url.match(/^https?:\/\//)) {
    url = "https://" + url;
  }

  setStatus("loading", "carddav-loading");
  while (uiElements.availableBooks.lastChild) {
    uiElements.availableBooks.lastChild.remove();
  }

  let foundBooks;
  try {
    foundBooks = await CardDAVUtils.detectAddressBooks(
      username,
      undefined,
      url,
      true
    );
  } catch (ex) {
    if (ex.result == Cr.NS_ERROR_NOT_AVAILABLE) {
      setStatus("error", "carddav-known-incompatible", {
        url: new URL(url).hostname,
      });
    } else {
      log.error(ex);
      setStatus("error", "carddav-connection-error");
    }
    return;
  }

  // Create a list of CardDAV directories that already exist.
  const existing = [];
  for (const d of MailServices.ab.directories) {
    if (d.dirType == Ci.nsIAbManager.CARDDAV_DIRECTORY_TYPE) {
      existing.push(d.getStringValue("carddav.url", ""));
    }
  }

  // Display a checkbox for each directory that doesn't already exist.
  let alreadyAdded = 0;
  for (const book of foundBooks) {
    if (existing.includes(book.url.href)) {
      alreadyAdded++;
      continue;
    }
    const checkbox = uiElements.availableBooks.appendChild(
      document.createXULElement("checkbox")
    );
    checkbox.setAttribute("label", book.name);
    checkbox.checked = true;
    checkbox.value = book.url.href;
    checkbox._book = book;
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
}

function setStatus(status, message, args) {
  uiElements.username.disabled = status == "loading";
  uiElements.location.disabled = status == "loading";

  switch (status) {
    case "loading":
      uiElements.statusImage.setAttribute(
        "src",
        "chrome://messenger/skin/icons/spinning.svg"
      );
      break;
    case "error":
      uiElements.statusImage.setAttribute(
        "src",
        "chrome://global/skin/icons/warning.svg"
      );
      uiElements.statusImage.removeAttribute("srcset");
      break;
    default:
      uiElements.statusImage.removeAttribute("src");
      uiElements.statusImage.removeAttribute("srcset");
      break;
  }

  if (status) {
    uiElements.statusArea.setAttribute("status", status);
    document.l10n.setAttributes(uiElements.statusMessage, message, args);
  } else {
    uiElements.statusArea.removeAttribute("status");
    uiElements.statusMessage.removeAttribute("data-l10n-id");
    uiElements.statusMessage.textContent = "";
  }

  // Grow to fit the list of books. Uses `resizeBy` because it has special
  // handling in SubDialog.sys.mjs that the other resize functions don't have.
  window.resizeBy(0, Math.min(250, uiElements.availableBooks.scrollHeight));
  window.dispatchEvent(new CustomEvent("status-changed"));
}

window.addEventListener("dialogaccept", async event => {
  if (uiElements.resultsArea.hidden) {
    event.preventDefault();
    check();
    return;
  }

  if (uiElements.availableBooks.childElementCount == 0) {
    return;
  }

  for (const checkbox of uiElements.availableBooks.children) {
    if (checkbox.checked) {
      const book = await checkbox._book.create();
      if (window.arguments[0]) {
        // Pass the UID of the book back to the opening window.
        window.arguments[0].newDirectoryUID = book.UID;
      }
    }
  }
});
