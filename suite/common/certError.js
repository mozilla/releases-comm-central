/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Error url MUST be formatted like this:
//   about:certerror?e=error&u=url&d=desc

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

initPage();

function getCSSClass()
{
  var url = document.documentURI;
  var matches = url.match(/s\=([^&]+)\&/);
  // s is optional, if no match just return nothing
  if (!matches || matches.length < 2)
    return "";

  // parenthetical match is the second entry
  return decodeURIComponent(matches[1]);
}

function getDescription()
{
  var url = document.documentURI;
  var desc = url.search(/d\=/);

  // desc == -1 if not found; if so, return an empty string
  // instead of what would turn out to be portions of the URI
  if (desc == -1)
    return "";

  return decodeURIComponent(url.slice(desc + 2));
}

function initPage()
{
  var intro = document.getElementById("introContentP1");
  var node = document.evaluate('//text()[string()="#1"]', intro, null,
                               XPathResult.ANY_UNORDERED_NODE_TYPE,
                               null).singleNodeValue;
  if (node)
    node.textContent = location.host;

  switch (getCSSClass()) {
  case "expertBadCert":
    toggle("technicalContent");
    toggle("expertContent");
    // fall through

  default:
    document.getElementById("badStsCertExplanation").remove();
    if (window == window.top)
      break;
    // else fall though

  // Disallow overrides if this is a Strict-Transport-Security
  // host and the cert is bad (STS Spec section 7.3);
  // or if the cert error is in a frame (bug 633691).
  case "badStsCert":
    document.getElementById("expertContent").remove();
    break;
  }

  addDomainErrorLinks();
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
