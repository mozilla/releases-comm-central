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

function getErrorCode() {
  return gSearchParams.get("e");
}

function getCSSClass() {
  return gSearchParams.get("s");
}

function getDescription() {
  return gSearchParams.get("d");
}

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

  let err = getErrorCode();
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
    } else {
      let desc = getDescription();
      if (!illustratedErrors.includes(err) && gIsNetError) {
        let codeRe = /<a id="errorCode" title="([^"]+)">/;
        let codeResult = codeRe.exec(desc);
        if (codeResult) {
          let msg = desc.slice(0, codeResult.index) + codeResult[1];
          sd.textContent = msg;
          sd.className = "wrap";
        } else {
          sd.textContent = desc;
        }
      } else {
        sd.textContent = desc;
      }
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

  let className = getCSSClass();
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
  } else {
    addDomainErrorLinks();
  }
}

/* In the case of SSL error pages about domain mismatch, see if
   we can hyperlink the user to the correct site.  We don't want
   to do this generically since it allows MitM attacks to redirect
   users to a site under attacker control, but in certain cases
   it is safe (and helpful!) to do so.  Bug 402210
*/
function addDomainErrorLinks() {
  // Rather than textContent, we need to treat description as HTML
  var sd = document.getElementById("technicalContentText");
  if (!sd)
    return;

  var desc = getDescription();

  // sanitize description text - see bug 441169

  // First, find the index of the <a> tag we care about, being careful not to
  // use an over-greedy regex
  var codeRe = /<a id="errorCode" title="([^"]+)">/;
  var codeResult = codeRe.exec(desc);
  var domainRe = /<a id="cert_domain_link" title="([^"]+)">/;
  var domainResult = domainRe.exec(desc);
  // The order of these links in the description is fixed in
  // TransportSecurityInfo.cpp:formatOverridableCertErrorMessage.
  var firstResult = domainResult;
  if (!domainResult)
    firstResult = codeResult;
  if (!firstResult) {
    sd.textContent = desc;
    return;
  }

  // Remove sd's existing children.
  sd.textContent = "";

  // Everything up to the link should be text content.
  sd.appendChild(document.createTextNode(desc.slice(0, firstResult.index)));

  // Now create the actual links.
  var link;
  if (domainResult) {
    link = createLink(sd, "cert_domain_link", domainResult[1]);
    // Append text for anything between the two links.
    sd.appendChild(document.createTextNode(desc.slice(desc.indexOf("</a>") + "</a>".length, codeResult.index)));
  }
  createLink(sd, "errorCode", codeResult[1]);

  // Finally, append text for anything after the closing </a>
  sd.appendChild(document.createTextNode(desc.slice(desc.indexOf("</a>") + "</a>".length)));

  if (!link)
    return;

  // Then initialize the cert domain link.
  var okHost = link.getAttribute("title");
  var thisHost = document.location.hostname;
  var proto = document.location.protocol;

  // If okHost is a wildcard domain ("*.example.com") let's
  // use "www" instead.  "*.example.com" isn't going to
  // get anyone anywhere useful. bug 432491
  okHost = okHost.replace(/^\*\./, "www.");

  /* case #1:
   * example.com uses an invalid security certificate.
   *
   * The certificate is only valid for www.example.com
   *
   * Make sure to include the "." ahead of thisHost so that
   * a MitM attack on paypal.com doesn't hyperlink to "notpaypal.com"
   *
   * We'd normally just use a RegExp here except that we lack a
   * library function to escape them properly (bug 248062), and
   * domain names are famous for having '.' characters in them,
   * which would allow spurious and possibly hostile matches.
   */
  if (okHost.endsWith("." + thisHost))
    link.href = proto + "//" + okHost;

  /* case #2:
   * browser.garage.maemo.org uses an invalid security certificate.
   *
   * The certificate is only valid for garage.maemo.org
   */
  if (thisHost.endsWith("." + okHost))
    link.href = proto + "//" + okHost;

  // If we set a link, meaning there's something helpful for
  // the user here, expand the section by default
  if (link.href && getCSSClass() != "expertBadCert")
    toggle("technicalContent");
}

function createLink(el, id, text) {
  var anchorEl = document.createElement("a");
  anchorEl.setAttribute("id", id);
  anchorEl.setAttribute("title", text);
  anchorEl.appendChild(document.createTextNode(text));
  el.appendChild(anchorEl);
  return anchorEl;
}

function toggle(id) {
  var el = document.getElementById(id);
  if (el.hasAttribute("collapsed"))
    el.removeAttribute("collapsed");
  else
    el.setAttribute("collapsed", true);
}
