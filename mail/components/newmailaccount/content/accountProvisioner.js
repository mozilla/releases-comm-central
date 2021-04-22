/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals MsgAccountManager */

var { AppConstants } = ChromeUtils.import(
  "resource://gre/modules/AppConstants.jsm"
);
var { ConsoleAPI } = ChromeUtils.import("resource://gre/modules/Console.jsm");
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);
var { PluralForm } = ChromeUtils.import(
  "resource://gre/modules/PluralForm.jsm"
);
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

// Get a configured logger for this component.
// To debug, set mail.provider.loglevel="All"
var gLog = new ConsoleAPI({
  prefix: "mail.provider",
  maxLogLevel: "warn",
  maxLogLevelPref: "mail.provider.loglevel",
});
var stringBundle = Services.strings.createBundle(
  "chrome://messenger/locale/newmailaccount/accountProvisioner.properties"
);

var RETRY_TIMEOUT = 5000; // 5 seconds
var CONNECTION_TIMEOUT = 15000; // 15 seconds

function isAccel(event) {
  return AppConstants.platform == "macosx" ? event.metaKey : event.ctrlKey;
}

var MAX_SMALL_ADDRESSES = 2;

var storedData = {};

function splitName(str) {
  let i = str.lastIndexOf(" ");
  if (i >= 1) {
    return [str.substring(0, i), str.substring(i + 1)];
  }
  return [str, ""];
}

/**
 * Replace occurrences of placeholder with the given node
 *
 * @param aTextContainer {Node}  DOM node containing the text child
 * @param aTextNode {Node}       Text node containing the text, child of the aTextContainer
 * @param aPlaceholder {String}  String to look for in aTextNode's textContent
 * @param aReplacement {Node}    DOM node to insert instead of the found replacement
 */
function insertHTMLReplacement(
  aTextContainer,
  aTextNode,
  aPlaceholder,
  aReplacement
) {
  if (aTextNode.textContent.includes(aPlaceholder)) {
    let placeIndex = aTextNode.textContent.indexOf(aPlaceholder);
    let restNode = aTextNode.splitText(placeIndex + aPlaceholder.length);
    aTextContainer.insertBefore(aReplacement, restNode);
    let placeholderNode = aTextNode.splitText(placeIndex);
    placeholderNode.remove();
  }
}

/**
 * Logic and functionality for the Account Provisioner dialog.  Sets and reacts
 * to user interaction events, deals with searching and search results, and
 * tracks / maintains window state throughout the Account Provisioner workflow.
 */
var EmailAccountProvisioner = {
  _inited: false,
  _loadingProviders: false,
  _loadedProviders: false,
  _loadProviderRetryId: null,
  providers: {},
  _someProvidersChecked: false,
  // These get passed in when creating the Account Provisioner window.
  openAccountSetupTab: window.arguments[0].openAccountSetupTab,
  openAddonsMgr: window.arguments[0].openAddonsMgr,

  get someProvidersChecked() {
    return this._someProvidersChecked;
  },

  set someProvidersChecked(aVal) {
    this._someProvidersChecked = aVal;
    EmailAccountProvisioner.onSearchInputOrProvidersChanged();
  },

  /**
   * Get the list of loaded providers that we got back from the server.
   */
  get loadedProviders() {
    return this._loadedProviders;
  },

  /**
   * Returns the URL for retrieving suggested names from the
   * selected providers.
   */
  get suggestFromName() {
    return Services.prefs.getCharPref("mail.provider.suggestFromName");
  },

  /**
   * Returns the language tag of the language that the user currently accepts.
   */
  get userLanguage() {
    return Services.locale.requestedLocale.split("-")[0];
  },

  /**
   * A helper function to enable or disable the Search button.
   */
  searchButtonEnabled(aVal) {
    document.getElementById("searchSubmit").disabled = !aVal;
  },

  /**
   * A setter for enabling / disabling the search fields.
   */
  searchEnabled(aVal) {
    document.getElementById("name").disabled = !aVal;
    for (let node of document.querySelectorAll(".providerCheckbox")) {
      node.disabled = !aVal;
    }
    this.searchButtonEnabled(aVal);
  },

  /**
   * If aVal is true, show the spinner, else hide.
   */
  spinning(aVal) {
    let display = aVal ? "block" : "none";
    for (let node of document.querySelectorAll("#notifications .spinner")) {
      node.style.display = display;
    }
  },

  /**
   * Sets the current window state to display the "success" page, with options
   * for composing messages, setting a signature, finding add-ons, etc.
   */
  showSuccessPage() {
    gLog.info("Showing the success page");
    let engine = Services.search.getEngineByName(
      window.arguments[0].search_engine
    );
    let account = window.arguments[0].account;

    if (engine && Services.search.defaultEngine != engine) {
      // Expose the search engine checkbox
      let searchEngineWrap = document.getElementById("search_engine_wrap");
      let searchEngineCheck = document.getElementById("search_engine_check");
      searchEngineWrap.style.display = "block";
      searchEngineWrap.addEventListener("click", function() {
        searchEngineCheck.click();
        return false;
      });

      searchEngineCheck.addEventListener("click", function(event) {
        event.stopPropagation();
      });

      // Set up the fields...
      searchEngineCheck.checked = true;

      let b = document.createElement("b");
      b.appendChild(document.createTextNode(engine.name));

      let searchStr = document.createTextNode(
        stringBundle.GetStringFromName("searchEngineDesc")
      );
      let searchElem = document.getElementById("search_engine_desc");
      searchElem.textContent = "";
      searchElem.appendChild(searchStr);
      insertHTMLReplacement(searchElem, searchElem.firstChild, "%S", b);
    }

    document
      .getElementById("success-compose")
      .addEventListener("click", function() {
        MailServices.compose.OpenComposeWindow(
          null,
          null,
          null,
          Ci.nsIMsgCompType.New,
          Ci.nsIMsgCompFormat.Default,
          account.defaultIdentity,
          null,
          null
        );
      });

    document
      .getElementById("success-addons")
      .addEventListener("click", function() {
        EmailAccountProvisioner.openAddonsMgr();
      });

    document
      .getElementById("success-signature")
      .addEventListener("click", function() {
        MsgAccountManager(null, account.incomingServer);
      });

    document.getElementById("window").style.display = "none";
    document.getElementById("successful_account").style.display = "block";
  },

  /**
   * Save the name entered into the search field to a pref, so we can
   * reconstitute it on respawn later.
   */
  saveName() {
    let name = document.getElementById("name").value.trim();
    Services.prefs.setStringPref("mail.provider.realname", name);
  },

  onSearchInputOrProvidersChanged(event) {
    let emptyName = document.getElementById("name").value == "";
    EmailAccountProvisioner.searchButtonEnabled(
      !emptyName && EmailAccountProvisioner.someProvidersChecked
    );
  },

  /**
   * Hook up our events, populate the DOM, set our hooks, do all of our
   * prep work.  Since this is called via jQuery on document ready,
   * the value for "this" is the actual window document, hence the need
   * to explicitly refer to EmailAccountProvisioner.
   */
  init() {
    // We can only init once, so bail out if we've been called again.
    if (EmailAccountProvisioner._inited) {
      return;
    }

    gLog.info("Initializing Email Account Provisioner");

    // For any anchor element that gets the "external" class, make it so that
    // when we click on that element, instead of loading up the href in the
    // window itself, we open up the link in the default browser.
    let opener = Cc[
      "@mozilla.org/uriloader/external-protocol-service;1"
    ].getService(Ci.nsIExternalProtocolService);
    document.addEventListener("click", function(e) {
      if (e.target.tagName == "a" && e.target.classList.contains("external")) {
        e.preventDefault();
        let uri = e.target.getAttribute("href");
        opener.loadURI(Services.io.newURI(uri, "UTF-8"));
      }
    });

    // Throw the disclaimer into the window.  In the future, this should probably
    // be done in the actual XHTML page, instead of injected via JS.
    let commentary = document.querySelector(".commentary");

    let a = document.createElement("a");
    a.setAttribute(
      "href",
      "https://www.mozilla.org/thunderbird/legal/privacy/"
    );
    a.setAttribute("class", "external");
    a.appendChild(
      document.createTextNode(stringBundle.GetStringFromName("privacyPolicy"))
    );

    let span = document.createElement("span");
    span.appendChild(
      document.createTextNode(
        stringBundle.GetStringFromName("privacyDisclaimer")
      )
    );
    insertHTMLReplacement(span, span.firstChild, "#1", a);

    let placeHolder = document.createElement("span");
    placeHolder.setAttribute("class", "placeholder");

    // Replace the other placeholder in whatever child it resides now.
    let children = span.childNodes;
    for (let i = 0; i < children.length; i++) {
      if (children[i].nodeType == Node.TEXT_NODE) {
        insertHTMLReplacement(span, children[i], "#2", placeHolder);
      }
    }

    commentary.appendChild(span);

    EmailAccountProvisioner.tryToPopulateProviderList();

    // Link the keypress function to the name field so that we can enable and
    // disable the search button.
    let nameElement = document.getElementById("name");
    nameElement.addEventListener(
      "keyup",
      EmailAccountProvisioner.onSearchInputOrProvidersChanged
    );

    // If we have a name stored, populate the search field with it.
    let name =
      Services.prefs.getStringPref("mail.provider.realname") ||
      nameElement.value;
    if (!name && "@mozilla.org/userinfo;1" in Cc) {
      name = Cc["@mozilla.org/userinfo;1"].getService(Ci.nsIUserInfo).fullname;
    }
    nameElement.value = name;
    EmailAccountProvisioner.saveName();

    // Pretend like we've typed something into the search input to set the
    // initial enabled/disabled state of the search button.
    EmailAccountProvisioner.onSearchInputOrProvidersChanged();

    document.getElementById("window").style.height =
      window.innerHeight - 1 + "px";

    document
      .querySelector("button.existing")
      .addEventListener("click", function() {
        EmailAccountProvisioner.saveName();
        EmailAccountProvisioner.openAccountSetupTab();
        window.close();
      });

    // Handle Ctrl-W and Esc
    window.addEventListener("keypress", function(event) {
      if ((event.which == "119" && isAccel(event)) || event.keyCode == 27) {
        window.close();
      }
    });

    document
      .getElementById("search")
      .addEventListener("submit", EmailAccountProvisioner.onSearchSubmit);

    let notifications = document.getElementById("notifications");
    notifications.addEventListener("click", function(event) {
      if (
        event.target.tagName == "button" &&
        event.target.classList.contains("create")
      ) {
        EmailAccountProvisioner.onAddressSelected(event.target);
      }
    });

    // Handle clicking on both email address suggestions, as well
    // as the headers for the providers of those suggestions.
    let results = document.getElementById("results");
    results.addEventListener("click", event => {
      // Find the resultsGroup this click was in.
      let resultsGroup = event.target;
      while (resultsGroup) {
        if (resultsGroup.classList.contains("resultsGroup")) {
          break;
        }
        resultsGroup = resultsGroup.parentElement;
      }
      if (!resultsGroup) {
        throw new Error("Unexpected error finding resultsGroup.");
      }

      // Return if we're already expanded
      if (resultsGroup.classList.contains("expanded")) {
        return;
      }

      for (let child of resultsGroup.parentElement.children) {
        if (child != resultsGroup) {
          child.classList.remove("expanded");
          // Hide the other boxes.
          for (let node of child.querySelectorAll(".extra")) {
            node.classList.add("slideUp");
            for (let address of node.querySelectorAll(".address")) {
              address.classList.remove("showWithFade");
              address.classList.add("hideWithFade");
            }
          }
          let more = child.querySelector(".more");
          let makeListener = (aNode, aMore) => {
            let listener = () => {
              if (aMore) {
                aMore.style.display = "block";
              }
              aNode.querySelector("button").disabled = true;
              aNode.removeEventListener("transitionend", listener);
            };
            return listener;
          };
          for (let node of child.querySelectorAll(".pricing")) {
            node.classList.remove("showWithFade");
            // Disable the pricing button and show the "more" text
            // after the transition is complete.
            node.addEventListener("transitionend", makeListener(node, more));
            node.classList.add("hideWithFade");
          }
          for (let node of child.querySelectorAll(".price")) {
            node.classList.remove("hideWithFade");
            node.classList.add("showWithFade");
          }
        } else {
          child.classList.add("expanded");
          // And show this box.
          let more = child.querySelector(".more");
          if (more) {
            more.style.display = "none";
          }
          for (let node of child.querySelectorAll(".pricing")) {
            node.classList.remove("hideWithFade");
            node.classList.add("showWithFade");
            node.querySelector("button").disabled = false;
          }
          for (let node of child.querySelectorAll(".price")) {
            node.classList.remove("showWithFade");
            node.classList.add("hideWithFade");
          }
          for (let node of child.querySelectorAll(".extra")) {
            node.classList.remove("slideUp");
            for (let address of node.querySelectorAll(".address")) {
              address.classList.remove("hideWithFade");
              address.classList.add("showWithFade");
            }
          }
        }
      }
    });

    for (let node of document.querySelectorAll("button.close")) {
      node.addEventListener("click", () => window.close());
    }

    window.addEventListener("unload", function() {
      let searchEngineCheck = document.getElementById("search_engine_check");
      if (window.arguments[0].search_engine && searchEngineCheck.checked) {
        let engine = Services.search.getEngineByName(
          window.arguments[0].search_engine
        );
        Services.search.defaultEngine = engine;
      }
    });

    if (window.arguments[0].success) {
      // Show the success page which lets a user compose mail, find add-ons,
      // set a signature, etc.
      gLog.info(
        "Looks like we just finished ordering an address - showing the success page..."
      );
      EmailAccountProvisioner.showSuccessPage();
    } else {
      // The default mode, where we display the search input, providers, etc
      document.getElementById("window").style.display = "block";
      document.getElementById("successful_account").style.display = "none";
    }

    gLog.info("Email Account Provisioner init complete.");

    EmailAccountProvisioner._inited = true;
  },

  /**
   * Event handler for when the user submits the search request for their
   * name to the suggestFromName service.
   */
  onSearchSubmit() {
    for (let node of document.getElementById("notifications").children) {
      node.style.display = "none";
    }
    document.getElementById("instructions").classList.add("hide");
    EmailAccountProvisioner.saveName();

    // Here's where we do some kind of hack-y client-side sanitization.
    // Believe it or not, this is how you sanitize stuff to HTML elements
    // via jQuery.
    // let name = $("<div></div>").text($("#name").val()).html().trim();
    // Not quite sure what this was for, but here's the hack converted
    // to vanilla JS.
    let nameElement = document.getElementById("name");
    let div = document.createElement("div");
    div.textContent = nameElement.value;
    let name = div.innerHTML.trim();
    if (!name) {
      nameElement.select();
      nameElement.focus();
      return;
    }

    EmailAccountProvisioner.searchEnabled(false);
    EmailAccountProvisioner.spinning(true);
    let [firstname, lastname] = splitName(name);
    let selectedProviderList = [
      ...document.querySelectorAll(".provider input:checked"),
    ];
    let providerList = selectedProviderList.map(node => node.value).join(",");

    let request = new XMLHttpRequest();
    request.open(
      "GET",
      EmailAccountProvisioner.suggestFromName +
        "?first_name=" +
        encodeURIComponent(firstname) +
        "&last_name=" +
        encodeURIComponent(lastname) +
        "&providers=" +
        encodeURIComponent(providerList) +
        "&version=2"
    );
    request.onload = function() {
      let data;
      try {
        data = JSON.parse(request.responseText);
      } catch (e) {}
      EmailAccountProvisioner.onSearchResults(data);
    };
    request.onerror = () => {
      gLog.info("Error response of XMLHttpRequest fetching address data.");
      EmailAccountProvisioner.showSearchError();
    };
    request.ontimeout = () => {
      gLog.info("Timeout of XMLHttpRequest fetching address data.");
      EmailAccountProvisioner.showSearchError();
    };
    request.onloadend = function() {
      // Also called if we timeout.
      let firstAndLastName = document.getElementById("FirstAndLastName");
      firstAndLastName.textContent = (firstname + " " + lastname).trim();
      EmailAccountProvisioner.searchEnabled(true);
      EmailAccountProvisioner.spinning(false);
    };
    request.timeout = CONNECTION_TIMEOUT;
    request.send(null);
  },

  /**
   * Event handler for when the user selects an address by clicking on
   * the price button for that address.  This function spawns the content
   * tab for the address order form, and then closes the Account Provisioner
   * window.
   */
  onAddressSelected(aTarget) {
    gLog.info("An address was selected by the user.");
    let provider = EmailAccountProvisioner.providers[aTarget.dataset.provider];

    // Replace the variables in the url.
    let url = provider.api;
    let [firstName, lastName] = splitName(
      document.getElementById("name").value.trim()
    );
    let email = aTarget.getAttribute("address");
    url = url.replace("{firstname}", firstName);
    url = url.replace("{lastname}", lastName);
    url = url.replace("{email}", email);

    // And add the extra data.
    let data = storedData[provider.id];
    delete data.provider;
    for (let name in data) {
      url +=
        (!url.includes("?") ? "?" : "&") +
        name +
        "=" +
        encodeURIComponent(data[name]);
    }

    gLog.info("Opening up a contentTab with the order form.");
    // Then open a content tab.
    let mail3Pane = Services.wm.getMostRecentWindow("mail:3pane");
    let tabmail = mail3Pane.document.getElementById("tabmail");
    tabmail.openTab("accountProvisionerTab", {
      url,
      realName: (firstName + " " + lastName).trim(),
      email,
      searchEngine: provider.search_engine,
    });

    // The user has made a selection. Close the provisioner window and let
    // the provider setup process take place in the tab.
    window.close();
  },

  /**
   * Attempt to fetch the provider list from the server.  If it fails,
   * display an error message, and queue for retry.
   */
  tryToPopulateProviderList() {
    // If we're already in the middle of getting the provider list, or
    // we already got it before, bail out.
    if (this._loadingProviders || this._loadedProviders) {
      return;
    }

    // If there's a timeout ID for waking the account provisioner, clear it.
    if (this._loadProviderRetryId) {
      window.clearTimeout(this._loadProviderRetryId);
      this._loadProviderRetryId = null;
    }

    this.searchEnabled(false);
    this.spinning(true);

    let providerListUrl = Services.prefs.getCharPref(
      "mail.provider.providerList"
    );

    gLog.info(`Trying to populate provider list from ${providerListUrl}...`);

    let request = new XMLHttpRequest();
    request.open("GET", providerListUrl);
    request.onload = function() {
      let data;
      try {
        data = JSON.parse(request.responseText);
      } catch (e) {}
      EmailAccountProvisioner.populateProviderList(data);
    };
    request.onerror = () => {
      // Ugh, we couldn't get the JSON file. Maybe we're not online. Or maybe
      // the server is down, or the file isn't being served. Regardless, if
      // we get here, none of this stuff is going to work.
      EmailAccountProvisioner._loadProviderRetryId = window.setTimeout(
        () => EmailAccountProvisioner.tryToPopulateProviderList(),
        RETRY_TIMEOUT
      );
      EmailAccountProvisioner._loadingProviders = false;
      EmailAccountProvisioner.beOffline();
      gLog.error(
        "Something went wrong loading the provider list JSON file. " +
          "Going into offline mode."
      );
    };
    request.onloadend = function() {
      EmailAccountProvisioner._loadingProviders = false;
      EmailAccountProvisioner.spinning(false);
      gLog.info("Got provider list JSON.");
    };
    request.timeout = CONNECTION_TIMEOUT;
    request.ontimeout = () => {
      gLog.info("Timeout of XMLHttpRequest fetching provider list.");
      request.onerror();
    };
    request.send(null);

    EmailAccountProvisioner._loadingProviders = true;
    gLog.info("We've kicked off a request for the provider list JSON file...");
  },

  providerHasCorrectFields(provider) {
    let result = true;

    let required = [
      "id",
      "label",
      "paid",
      "languages",
      "api",
      "tos_url",
      "privacy_url",
    ];

    for (let aField of required) {
      let fieldExists = aField in provider;
      result &= fieldExists;

      if (!fieldExists) {
        gLog.error(
          "A provider did not have the field " +
            aField +
            ", and will be skipped."
        );
      }
    }

    return result;
  },

  /**
   * Take the fetched providers, create checkboxes, icons and labels,
   * and insert them below the search input.
   */
  populateProviderList(data) {
    gLog.info("Populating the provider list");

    if (!data || !data.length) {
      gLog.error("The provider list we got back from the server was empty!");
      EmailAccountProvisioner.beOffline();
      return;
    }

    let providerList = document.getElementById("providerList");
    let otherLangProviders = [];

    EmailAccountProvisioner.providers = {};

    data.forEach(provider => {
      if (!EmailAccountProvisioner.providerHasCorrectFields(provider)) {
        gLog.error("A provider had incorrect fields, and has been skipped");
        return;
      }

      EmailAccountProvisioner.providers[provider.id] = provider;

      let checkboxId = provider.id + "-check";

      let providerCheckbox = document.createElement("input");
      providerCheckbox.setAttribute("type", "checkbox");
      providerCheckbox.setAttribute("value", provider.id);
      providerCheckbox.className = "providerCheckbox";
      providerCheckbox.setAttribute("id", checkboxId);

      let providerEntry = document.createElement("li");
      providerEntry.className = "provider";
      providerEntry.appendChild(providerCheckbox);

      let icon = document.createElement("img");
      icon.className = "icon";
      // We add this even if there is no icon, so that the alignment with
      // providers without icons isn't broken.
      providerEntry.appendChild(icon);
      if (provider.icon) {
        // Note this favicon must be fetched, which takes a noticeable
        // time the first time it happens.
        icon.setAttribute("src", provider.icon);
      }

      let labelSpan = document.createElement("label");
      labelSpan.className = "providerLabel";
      labelSpan.setAttribute("for", checkboxId);
      labelSpan.textContent = provider.label;
      providerEntry.appendChild(labelSpan);

      providerCheckbox.addEventListener(
        "change",
        EmailAccountProvisioner.populateTermsAndPrivacyLinks
      );

      // Let's go through the array of languages for this provider, and
      // check to see if at least one of them matches the user's language.
      // If so, we'll show / select this provider by default.
      let ul = EmailAccountProvisioner.userLanguage;
      if (provider.languages.some(l => l == "*" || l.split("-")[0] == ul)) {
        providerCheckbox.setAttribute("checked", "true");
        providerEntry.style.display = "inline-block";
        providerList.appendChild(providerEntry);
      } else {
        providerEntry.classList.add("otherLanguage");
        otherLangProviders.push(providerEntry);
      }
    });

    if (otherLangProviders.length) {
      for (let provider of otherLangProviders) {
        providerList.appendChild(provider);
      }

      let otherLangDesc = document.getElementById("otherLangDesc");
      otherLangDesc.classList.remove("fadeOut");
      otherLangDesc.classList.add("fadeIn");
      otherLangDesc.addEventListener("click", function() {
        otherLangDesc.classList.remove("fadeIn");
        otherLangDesc.classList.add("fadeOut");
        for (let node of document.querySelectorAll(".otherLanguage")) {
          node.style.display = "inline-block";
          node.classList.add("showWithFade");
        }
      });
    }

    EmailAccountProvisioner.populateTermsAndPrivacyLinks();
    EmailAccountProvisioner.beOnline();
    EmailAccountProvisioner._loadedProviders = true;
    EmailAccountProvisioner.onSearchInputOrProvidersChanged();
  },

  /**
   * Go through each of the checked providers, and add the appropriate
   * ToS and privacy links to the disclaimer.
   */
  populateTermsAndPrivacyLinks() {
    gLog.info("Refreshing terms and privacy links");
    // Empty the Terms of Service and Privacy links placeholder.
    let placeholder = document.querySelector(".commentary .placeholder");

    let selectedProviders = [
      ...document.querySelectorAll(".provider input:checked"),
    ];
    let len = selectedProviders.length;

    EmailAccountProvisioner.someProvidersChecked = len > 0;
    if (!len) {
      // Something went really wrong - we shouldn't have gotten here. Bail out.
      return;
    }

    let providerList = new DocumentFragment();
    selectedProviders.forEach((checkbox, i) => {
      let providerId = checkbox.value;
      let provider = EmailAccountProvisioner.providers[providerId];

      let span = document.createElement("span");
      span.appendChild(document.createTextNode(provider.label + " ("));
      providerList.appendChild(span);

      let a = document.createElement("a");
      a.setAttribute("href", provider.privacy_url);
      a.setAttribute("class", "privacy external " + provider.id);
      a.appendChild(
        document.createTextNode(stringBundle.GetStringFromName("privacyPolicy"))
      );
      providerList.appendChild(a);

      span = document.createElement("span");
      span.appendChild(
        document.createTextNode(stringBundle.GetStringFromName("sepComma"))
      );
      providerList.appendChild(span);

      a = document.createElement("a");
      a.setAttribute("href", provider.tos_url);
      a.setAttribute("class", "tos external " + provider.id);
      a.appendChild(
        document.createTextNode(stringBundle.GetStringFromName("tos"))
      );
      providerList.appendChild(a);

      span = document.createElement("span");
      span.appendChild(document.createTextNode(")"));
      providerList.appendChild(span);

      if (len != 1) {
        if (i < len - 2) {
          span = document.createElement("span");
          span.appendChild(
            document.createTextNode(stringBundle.GetStringFromName("sepComma"))
          );
          providerList.appendChild(span);
        } else if (i == len - 2) {
          span = document.createElement("span");
          span.appendChild(
            document.createTextNode(stringBundle.GetStringFromName("sepAnd"))
          );
          providerList.appendChild(span);
        }
      }
    });

    placeholder.textContent = "";
    placeholder.appendChild(providerList);
  },

  /**
   * Something went wrong during search.  Show a generic error.  In the future,
   * we might want to show something a bit more descriptive.
   */
  showSearchError() {
    for (let node of document.getElementById("notifications").children) {
      node.style.display = "none";
    }
    for (let node of document.querySelectorAll("#notifications .error")) {
      node.style.display = "block";
      node.getBoundingClientRect();
      node.classList.add("showWithFade");
    }
  },

  /**
   * Once we've received search results from the server, create some
   * elements to display those results, and inject them into the DOM.
   */
  onSearchResults(data) {
    gLog.info("Got back search results");

    // Empty any old results.
    let results = document.getElementById("results");
    results.textContent = "";

    if (!data || !data.length) {
      // If we've gotten back nonsense, display the generic
      // error message, and bail out.
      gLog.error("We got nothing back from the server for search results!");
      EmailAccountProvisioner.showSearchError();
      return;
    }

    // Get a list of the providers that the user checked - we'll
    // check against these to make sure the server didn't send any
    // back from a provider that the user did not select.
    let selectedProviderList = [
      ...document.querySelectorAll(".provider input:checked"),
    ];
    let selectedProviders = selectedProviderList.map(node => node.value);
    gLog.info(selectedProviders.length + " selected providers.");

    // Filter out any results that don't match our requirements...
    let returnedProviders = data.filter(function(aResult) {
      // We require that the search succeeded for a provider, that we
      // got at least one result, and that the provider is actually in
      // the list of providers that we care about.
      let providerInList =
        aResult.provider in EmailAccountProvisioner.providers;

      if (!providerInList) {
        gLog.error(
          "Got a result back for a provider that was not " +
            "in the original providerList: " +
            aResult.provider
        );
      }

      let providerSelected = selectedProviders.includes(aResult.provider);

      if (!providerSelected) {
        gLog.error(
          "Got a result back for a provider that the user did " +
            "not select: " +
            aResult.provider
        );
      }

      return (
        aResult.succeeded &&
        aResult.addresses.length > 0 &&
        providerInList &&
        providerSelected
      );
    });

    if (returnedProviders.length == 0) {
      gLog.info("There weren't any results for the selected providers.");
      // Display the generic error message, and bail out.
      EmailAccountProvisioner.showSearchError();
      return;
    }

    for (let provider of returnedProviders) {
      let group = document.createElement("div");
      group.className = "resultsGroup";

      let header = document.getElementById("resultsHeader").cloneNode(true);
      header.classList.remove("displayNone");
      header.classList.add("selection");

      let providerLabel = document.createTextNode(
        EmailAccountProvisioner.providers[provider.provider].label
      );
      header.querySelector(".provider").appendChild(providerLabel);

      let providerPrice;
      if (provider.price && provider.price != "0") {
        providerPrice = document.createTextNode(provider.price);
      } else {
        providerPrice = document.createTextNode(
          stringBundle.GetStringFromName("free")
        );
      }
      header.querySelector(".price").appendChild(providerPrice);

      group.appendChild(header);

      let renderedAddresses = 0;
      let addrIndex = 0;
      for (let address of provider.addresses) {
        addrIndex++;

        // Figure out the price to display on the address button, as so:
        // If there is a per-address price of > 0, use that.
        // Otherwise, if there is a per-address price of 0, use "Free",
        // Otherwise, there's no per-address price,
        //   so if the provider's price is > 0, use that.
        //   Or if the provider's price is 0, use "Free".
        let priceStr;
        if (address.price && address.price != "0") {
          priceStr = stringBundle.formatStringFromName("price", [
            address.price,
          ]);
        } else if (address.price && address.price == "0") {
          priceStr = stringBundle.GetStringFromName("free");
        } else if (provider.price && provider.price != "0") {
          priceStr = stringBundle.formatStringFromName("price", [
            provider.price,
          ]);
        } else {
          priceStr = stringBundle.GetStringFromName("free");
        }

        let templateElement = document.querySelector("#result_tmpl");
        let result = document.importNode(templateElement.content, true)
          .children[0];
        let finalAddress = address.address ? address.address : address;
        function replacePlaceholders(elem) {
          if (elem.childNodes.length > 0) {
            elem.childNodes.forEach(elem => replacePlaceholders(elem));
          }

          if (elem.nodeType == elem.TEXT_NODE) {
            if (elem.textContent == "${priceStr}") {
              elem.textContent = priceStr;
            }
            if (elem.textContent == "${address}") {
              elem.textContent = finalAddress;
            }
          }
          if (
            elem.nodeType == elem.ELEMENT_NODE &&
            elem.getAttribute("address") == "${address}"
          ) {
            elem.setAttribute("address", finalAddress);
          }
        }
        replacePlaceholders(result);
        group.appendChild(result);
        // Keep a count of the rendered addresses for the "More" buttons, etc.
        renderedAddresses++;

        if (addrIndex > MAX_SMALL_ADDRESSES) {
          result.classList.add("extra");
          for (let address of result.querySelectorAll(".address")) {
            address.classList.add("hideWithFade");
          }
          result.classList.add("slideUp");
        }
      }
      gLog.info(
        "Added " +
          renderedAddresses +
          " addresses, showing at most " +
          MAX_SMALL_ADDRESSES +
          "."
      );

      if (renderedAddresses > MAX_SMALL_ADDRESSES) {
        let more = renderedAddresses - MAX_SMALL_ADDRESSES;
        let moreStr = PluralForm.get(
          more,
          stringBundle.GetStringFromName("moreOptions")
        ).replace("#1", more);
        let last = group.querySelector(
          ".row:nth-child(" + (MAX_SMALL_ADDRESSES + 1) + ")"
        );
        let div = document.createElement("div");
        div.setAttribute("class", "more");
        div.appendChild(document.createTextNode(moreStr));
        last.appendChild(div);
      }
      for (let node of group.querySelectorAll("button.create")) {
        node.dataset.provider = provider.provider;
      }

      // There doesn't seem to be a #resultsFooter anywhere.
      // let footer = document.getElementById("resultsFooter").cloneNode(true);
      // footer.classList.remove("displayNone");
      // group.append(footer);

      results.appendChild(group);
    }

    for (let node of document.getElementById("notifications").children) {
      if (node.classList.contains("success")) {
        node.style.display = "block";
      } else {
        node.style.display = "none";
      }
    }
    for (let provider of data) {
      delete provider.succeeded;
      delete provider.addresses;
      delete provider.price;
      storedData[provider.provider] = provider;
    }
  },

  /**
   * If we cannot retrieve the provider list from the server, display a
   * message about connection problems, and disable the search fields.
   */
  beOffline() {
    let offlineMsg = stringBundle.GetStringFromName("cannotConnect");
    let element = document.getElementById("cannotConnectMessage");
    if (!element.hasChildNodes()) {
      element.appendChild(document.createTextNode(offlineMsg));
    }
    element.style.display = "block";
    element.style.opacity = 1;
    this.searchEnabled(false);
    gLog.info("Email Account Provisioner is in offline mode.");
  },

  /**
   * If we're suddenly able to get the provider list, hide the connection
   * error message and re-enable the search fields.
   */
  beOnline() {
    let element = document.getElementById("cannotConnectMessage");
    element.style.display = "none";
    element.textContent = "";
    this.searchEnabled(true);
    gLog.info("Email Account Provisioner is in online mode.");
  },
};

window.addEventListener(
  "online",
  EmailAccountProvisioner.tryToPopulateProviderList
);

document.addEventListener("DOMContentLoaded", EmailAccountProvisioner.init);
