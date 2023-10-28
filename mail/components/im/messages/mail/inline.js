/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function checkNewText(target) {
  if (target.className == "event-row") {
    const parent = target.closest(".event");
    // We need to start a group with this element if there are at least 4
    // system messages and they aren't already grouped.
    if (
      !parent?.grouped &&
      parent?.querySelector(".event-row:nth-of-type(4)")
    ) {
      const toggle = document.createElement("div");
      toggle.className = "eventToggle";
      toggle.addEventListener("click", event => {
        toggle.closest(".event").classList.toggle("hide-children");
      });
      parent.insertBefore(
        toggle,
        parent.querySelector(".event-row:nth-of-type(2)")
      );
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
