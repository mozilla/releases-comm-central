/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../../mailnews/search/content/searchTerm.js */

window.addEventListener("load", mailViewOnLoad);
window.addEventListener("unload", mailViewOnUnLoad);

document.addEventListener("dialogaccept", onOK);

var gMailView = null;

var dialog;

function mailViewOnLoad() {
  initializeSearchWidgets();
  initializeMailViewOverrides();
  dialog = {};

  if ("arguments" in window && window.arguments[0]) {
    var args = window.arguments[0];
    if ("mailView" in args) {
      gMailView = window.arguments[0].mailView;
    }
    if ("onOkCallback" in args) {
      dialog.okCallback = window.arguments[0].onOkCallback;
    }
  }

  dialog.OKButton = document.querySelector("dialog").getButton("accept");
  dialog.nameField = document.getElementById("name");
  dialog.nameField.focus();

  setSearchScope(Ci.nsMsgSearchScope.offlineMail);

  if (gMailView) {
    dialog.nameField.value = gMailView.prettyName;
    initializeSearchRows(
      Ci.nsMsgSearchScope.offlineMail,
      gMailView.searchTerms
    );
  } else {
    onMore(null);
  }

  doEnabling();
}

function mailViewOnUnLoad() {}

function onOK() {
  var mailViewList = Cc["@mozilla.org/messenger/mailviewlist;1"].getService(
    Ci.nsIMsgMailViewList
  );

  // reflect the search widgets back into the search session
  var newMailView = null;
  if (gMailView) {
    gMailView.searchTerms = saveSearchTerms(gMailView.searchTerms, gMailView);
    // if the name of the view has been changed...
    if (gMailView.prettyName != dialog.nameField.value) {
      gMailView.mailViewName = dialog.nameField.value;
    }
  } else {
    // otherwise, create a new mail view
    newMailView = mailViewList.createMailView();

    newMailView.searchTerms = saveSearchTerms(
      newMailView.searchTerms,
      newMailView
    );
    newMailView.mailViewName = dialog.nameField.value;
    // now add the mail view to our mail view list
    mailViewList.addMailView(newMailView);
  }

  mailViewList.save();

  if (dialog.okCallback) {
    dialog.okCallback(gMailView ? gMailView : newMailView);
  }
}

function initializeMailViewOverrides() {
  // replace some text with something we want. Need to add some ids to searchOverlay.js
  // var orButton = document.getElementById('or');
  // orButton.setAttribute('label', 'Any of the following');
  // var andButton = document.getElementById('and');
  // andButton.setAttribute('label', 'All of the following');
  // matchAll doesn't make sense for views, since views are a single folder
  hideMatchAllItem();
}

function UpdateAfterCustomHeaderChange() {
  updateSearchAttributes();
}

function doEnabling() {
  if (dialog.nameField.value) {
    if (dialog.OKButton.disabled) {
      dialog.OKButton.disabled = false;
    }
  } else if (!dialog.OKButton.disabled) {
    dialog.OKButton.disabled = true;
  }
}

function onEnterInSearchTerm() {
  // no-op for us...
}
