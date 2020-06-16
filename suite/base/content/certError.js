/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The following parameters are parsed from the error URL:
//   e - the error code
//   s - custom CSS class to allow alternate styling/favicons
//   d - error description

// Note that this file uses document.documentURI to get
// the URL (with the format from above). This is because
// document.location.href gets the current URI off the docshell,
// which is the URL displayed in the location bar, i.e.
// the URI that the user attempted to load.

// setting up the event listeners and initializing the page
// in this way given that window.onload won't work here

document.getElementById("technicalContentHeading")
        .addEventListener("click", function() { toggle("technicalContent"); });

document.getElementById("expertContentHeading")
        .addEventListener("click", function() { toggle("expertContent"); });

let gSearchParams;

// Set to true on init if the error code is nssBadCert.
let gIsCertError;

// Set to true on init if a neterror.
let gIsNetError;

initPage();

function retryThis(buttonEl) {
  // Note: The application may wish to handle switching off "offline mode"
  // before this event handler runs, but using a capturing event handler.

  // Session history has the URL of the page that failed
  // to load, not the one of the error page. So, just call
  // reload(), which will also repost POST data correctly.
  try {
    location.reload();
  } catch (e) {
    // We probably tried to reload a URI that caused an exception to
    // occur;  e.g. a nonexistent file.
  }

  buttonEl.disabled = true;
}

function initPage() {
  gSearchParams = new URLSearchParams(document.documentURI.split("?")[1]);

  let err = gSearchParams.get("e");
  // List of neterror pages which have no error code and
  // could have an illustration instead.
  let illustratedErrors = [
    "malformedURI", "dnsNotFound", "connectionFailure", "netInterrupt",
    "netTimeout", "netReset", "netOffline",
  ];
  if (illustratedErrors.includes(err)) {
    document.body.classList.add("illustrated", err);
  }

  gIsCertError = (err == "nssBadCert");
  gIsNetError = (document.documentURI.startsWith("about:neterror"));

  let pageTitle = document.getElementById("ept_" + err);
  if (pageTitle) {
    document.title = pageTitle.textContent;
  }

  // If it's an unknown error or there's no title or description defined,
  // get the generic message.
  let errTitle = document.getElementById("et_" + err);
  let errDesc  = document.getElementById("ed_" + err);
  if (!errTitle || !errDesc) {
    errTitle = document.getElementById("et_generic");
    errDesc  = document.getElementById("ed_generic");
  }

  let title = document.getElementById("errorTitleText");
  if (title) {
    title.innerHTML = errTitle.innerHTML;
  }

  let sd = document.getElementById("errorShortDescText");
  if (sd) {
    if (gIsCertError) {
      sd.innerHTML = errDesc.innerHTML;
    } else if (!err || err == "unknownProtocolFound") {
      sd.remove();
    }
  }

  let xd = document.getElementById("errorShortDescExtra");
  if (xd) {
    let errExtra = document.getElementById("ex_" + err);
    if (gIsCertError && errExtra) {
      xd.innerHTML = errExtra.innerHTML;
    } else {
      xd.remove();
    }
  }

  let ld = document.getElementById("errorLongDesc");
  if (ld && !gIsCertError) {
    ld.innerHTML = errDesc.innerHTML;
  }

  // Remove undisplayed errors to avoid bug 39098.
  let errContainer = document.getElementById("errorContainer");
  errContainer.remove();

  if (gIsCertError || err == "inadequateSecurityError") {
    for (let host of document.querySelectorAll(".hostname")) {
      host.textContent = location.host;
    }
  }

  if (gIsCertError || err == "sslv3Used") {
    document.body.classList.add("certerror");
  }

  if (gIsCertError || err == "remoteXUL" || err == "cspBlocked" ||
      err == "inadequateSecurityError") {
    // Remove the "Try again" button for certificate errors, remote XUL errors,
    // CSP violations (Bug 553180) and HTTP/2 inadequate security,
    // given that it is useless.
    document.getElementById("netErrorButtonContainer").style.display = "none";
  }

  let className = gSearchParams.get("s");
  if (className && className != "expertBadCert") {
    // Associate a CSS class with the root of the page, if one was passed in,
    // to allow custom styling.
    // Not "expertBadCert" though, don't want to deal with the favicon
    document.documentElement.classList.add(className);
  }

  if (className == "expertBadCert") {
    toggle("technicalContent");
    toggle("expertContent");
  }

  // Disallow overrides if this is a Strict-Transport-Security
  // host and the cert is bad (STS Spec section 7.3);
  // or if the cert error is in a frame (bug 633691).
  if (className == "badStsCert" || window != top || !gIsCertError) {
    let expertContent = document.getElementById("expertContent");
    expertContent.remove();
  }
  if (className == "badStsCert") {
    document.getElementById("badStsCertExplanation").removeAttribute("hidden");
  }

  // For neterrors set a suitable class.
  if (gIsNetError) {
    document.body.classList.add("neterror");
  }

  // For neterrors and null error codes do not show the What Should I Do and
  // Technical Details sections.
  if (gIsNetError || !err) {
    let whatShould = document.getElementById("whatShouldIDoContent");
    whatShould.remove();
    let technicalContent = document.getElementById("technicalContent");
    technicalContent.remove();
  }
  var event = new CustomEvent("AboutNetAndCertErrorLoad", {bubbles: true});
  document.dispatchEvent(event);
}

function toggle(id) {
  var el = document.getElementById(id);
  if (el.hasAttribute("collapsed"))
    el.removeAttribute("collapsed");
  else
    el.setAttribute("collapsed", true);
}
