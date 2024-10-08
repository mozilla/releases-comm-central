/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const bg_gradient =
  "background: -moz-linear-gradient(top, rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.1) 15px, hsla(#, 100%, 98%, 1) 15px, hsla(#, 100%, 98%, 1));";
const bg_context_gradient =
  "background: -moz-linear-gradient(top, rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.05) 15px, hsla(#, 20%, 98%, 1) 15px, hsla(#, 20%, 98%, 1));";
const bg_color = "background-color: hsl(#, 100%, 98%);";

var body = document.getElementById("ibcontent");

function setColors(target) {
  var senderColor = target.getAttribute("data-senderColor");

  if (senderColor) {
    var regexp =
      /color:\s*hsl\(\s*(\d{1,3})\s*,\s*\d{1,3}\%\s*,\s*\d{1,3}\%\s*\)/;
    var parsed = regexp.exec(senderColor);

    if (parsed) {
      var senderHue = parsed[1];
      if (target.classList.contains("context")) {
        target.setAttribute(
          "style",
          bg_context_gradient.replace(/#/g, senderHue)
        );
      } else {
        target.setAttribute("style", bg_gradient.replace(/#/g, senderHue));
      }
    }
  }

  if (body.scrollHeight <= screen.height) {
    if (senderHue) {
      body.setAttribute("style", bg_color.replace("#", senderHue));
    } else if (target.classList.contains("outgoing")) {
      body.className = "outgoing-color";
      body.removeAttribute("style");
    } else if (target.classList.contains("incoming")) {
      body.className = "incoming-color";
      body.removeAttribute("style");
    } else if (target.classList.contains("event")) {
      body.className = "event-color";
      body.removeAttribute("style");
    }
  }
}

function checkNewText(target) {
  if (target.tagName == "DIV") {
    setColors(target);
  } else if (target.tagName == "P" && target.className == "event") {
    const parent = target.parentNode;
    // We need to start a group with this element if there are at least 3
    // system messages and they aren't already grouped.
    if (!parent?.grouped && parent?.querySelector("p.event:nth-of-type(3)")) {
      var div = document.createElement("div");
      div.className = "eventToggle";
      div.addEventListener("click", event =>
        event.target.parentNode.classList.toggle("hide-children")
      );
      parent.insertBefore(div, parent.querySelector("p.event:first-of-type"));
      parent.classList.add("hide-children");
      parent.grouped = true;
    }
  }
}

new MutationObserver(function (aMutations) {
  for (const mutation of aMutations) {
    for (const node of mutation.addedNodes) {
      if (node instanceof HTMLElement) {
        checkNewText(node);
      }
    }
  }
}).observe(document.getElementById("ibcontent"), {
  childList: true,
  subtree: true,
});
