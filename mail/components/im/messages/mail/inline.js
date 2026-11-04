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
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "eventToggle";
      toggle.ariaExpanded = "false";
      toggle.addEventListener("keypress", event => {
        // Keep native button activation from moving focus to the chat input.
        if (event.key == " " || event.key == "Enter") {
          event.stopPropagation();
        }
      });
      toggle.addEventListener("click", () => {
        const isHidden = toggle
          .closest(".event")
          .classList.toggle("hide-children");
        toggle.ariaExpanded = String(!isHidden);
      });
      parent.insertBefore(
        toggle,
        parent.querySelector(".event-row:nth-of-type(2)")
      );
      parent.classList.add("hide-children");
      parent.grouped = true;
    }
    const toggle = parent?.querySelector(".eventToggle");
    if (toggle) {
      toggle.ariaLabel = parent.querySelector(".event-row").textContent;
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
