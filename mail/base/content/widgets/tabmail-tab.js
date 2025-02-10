/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global MozElements, MozXULElement */

// Wrap in a block to prevent leaking to window scope.
{
  /**
   * The MozTabmailTab widget behaves as a tab in the messenger window.
   * It is used to navigate between different views. It displays information
   * about the view: i.e. name and icon.
   *
   * @augments {MozElements.MozTab}
   */
  class MozTabmailTab extends MozElements.MozTab {
    static get inheritedAttributes() {
      return {
        ".tab-background": "pinned,selected,titlechanged",
        ".tab-line": "selected=visuallyselected",
        ".tab-content": "pinned,selected,titlechanged,title=label",
        ".tab-throbber": "fadein,pinned,busy,progress,selected",
        ".tab-icon-image": "fadein,pinned,selected",
        ".tab-label-container": "pinned,selected=visuallyselected",
        ".tab-text": "text=label,accesskey,fadein,pinned,selected",
        ".tab-close-button": "fadein,pinned,selected=visuallyselected",
      };
    }

    connectedCallback() {
      if (this.delayConnectedCallback() || this.hasChildNodes()) {
        return;
      }

      this.setAttribute("is", "tabmail-tab");
      this.appendChild(
        MozXULElement.parseXULToFragment(
          `
          <stack class="tab-stack" flex="1">
            <vbox class="tab-background">
              <hbox class="tab-line"></hbox>
            </vbox>
            <html:div class="tab-content">
              <hbox class="tab-throbber" role="presentation"></hbox>
              <html:img class="tab-icon-image" alt="" role="presentation" />
              <hbox class="tab-label-container"
                    onoverflow="this.setAttribute('textoverflow', 'true');"
                    onunderflow="this.removeAttribute('textoverflow');"
                    flex="1">
                <label class="tab-text tab-label" role="presentation"></label>
              </hbox>
              <!-- We make the button non-focusable, otherwise each close
                 - button creates a new tab stop. See bug 1754097 -->
              <html:button class="plain-button tab-close-button"
                           tabindex="-1"
                           title="&closeTab.label;"
                           data-telemetry-id="tab-close-button">
                <!-- Button title should provide the accessible context. -->
                <html:img class="tab-close-icon" alt=""
                          src="chrome://global/skin/icons/close.svg" />
              </html:button>
            </html:div>
          </stack>
          `,
          ["chrome://messenger/locale/tabmail.dtd"]
        )
      );

      this.addEventListener(
        "dragstart",
        () => {
          document.dragTab = this;
        },
        true
      );

      this.addEventListener(
        "dragover",
        () => {
          document.dragTab = null;
        },
        true
      );

      const closeButton = this.querySelector(".tab-close-button");

      // Prevent switching to the tab before closing it by stopping the
      // mousedown event.
      closeButton.addEventListener("mousedown", event => {
        if (event.button != 0) {
          return;
        }
        event.stopPropagation();
      });

      closeButton.addEventListener("click", () =>
        document.getElementById("tabmail").removeTabByNode(this)
      );

      // Middle mouse button click on the tab also closes it.
      this.addEventListener("click", event => {
        if (event.button != 1) {
          return;
        }
        document.getElementById("tabmail").removeTabByNode(this);
      });

      this.setAttribute("context", "tabContextMenu");

      this.mCorrespondingMenuitem = null;

      this.initializeAttributeInheritance();
    }

    get linkedBrowser() {
      const tabmail = document.getElementById("tabmail");
      const tab = tabmail._getTabContextForTabbyThing(this, false)[1];
      return tabmail.getBrowserForTab(tab);
    }

    get mode() {
      const tabmail = document.getElementById("tabmail");
      const tab = tabmail._getTabContextForTabbyThing(this, false)[1];
      return tab.mode;
    }

    /**
     * Set the displayed icon for the tab.
     *
     * If a fallback source if given, it will be used instead if the given icon
     * source is missing or loads with an error.
     *
     * If both sources are null, then the icon will become invisible.
     *
     * @param {string|null} iconSrc - The icon source to display in the tab, or
     *   null to just use the fallback source.
     * @param {?string} [fallbackSrc] - The fallback source to display if the
     *   iconSrc is missing or broken.
     */
    setIcon(iconSrc, fallbackSrc) {
      if (iconSrc?.startsWith("http")) {
        iconSrc = `moz-icon:${iconSrc}`;
      }
      const icon = this.querySelector(".tab-icon-image");
      if (!fallbackSrc) {
        if (iconSrc) {
          icon.setAttribute("src", iconSrc);
        } else {
          icon.removeAttribute("src");
        }
        return;
      }
      if (!iconSrc) {
        icon.setAttribute("src", fallbackSrc);
        return;
      }
      if (iconSrc == icon.getAttribute("src")) {
        return;
      }

      // Set the tab image, and use the fallback if an error occurs.
      // Set up a one time listener for either error or load.
      const listener = event => {
        icon.removeEventListener("error", listener);
        icon.removeEventListener("load", listener);
        if (event.type == "error") {
          icon.setAttribute("src", fallbackSrc);
        }
      };
      icon.addEventListener("error", listener);
      icon.addEventListener("load", listener);
      icon.setAttribute("src", iconSrc);
    }
  }

  MozXULElement.implementCustomInterface(MozTabmailTab, [
    Ci.nsIDOMXULSelectControlItemElement,
  ]);

  customElements.define("tabmail-tab", MozTabmailTab, { extends: "tab" });
}
