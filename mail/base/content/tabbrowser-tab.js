/* This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global MozElements, MozXULElement */

{
  /**
    * The MozTabmailTab widget behaves as a tab in the messenger window.
    * It is used to navigate between different views. It displays information
    * about the view: i.e. name and icon.
    *
    * @extends {MozElements.MozTab}
    */
  class MozTabmailTab extends MozElements.MozTab {
    static get inheritedAttributes() {
      return {
        ".tab-background": "pinned,selected,titlechanged",
        ".tab-line": "selected=visuallyselected",
        ".tab-content": "pinned,selected,titlechanged",
        ".tab-throbber": "fadein,pinned,busy,progress,selected",
        ".tab-icon-image": "validate,src=image,src,fadein,pinned,selected",
        ".tab-label-container": "pinned,selected=visuallyselected",
        ".tab-text": "text=label,accesskey,fadein,pinned,selected",
        ".tab-close-button": "fadein,pinned,selected",
      };
    }

    connectedCallback() {
      if (this.delayConnectedCallback() || this.hasChildNodes()) {
        return;
      }

      this.setAttribute("is", "tabmail-tab");
      this.appendChild(MozXULElement.parseXULToFragment(`
        <stack class="tab-stack" flex="1" closetabtext="&closeTab.label;">
          <vbox class="tab-background">
            <hbox class="tab-line"></hbox>
          </vbox>
          <hbox class="tab-content" align="center">
            <image class="tab-throbber" role="presentation"></image>
            <image class="tab-icon-image" role="presentation"></image>
            <hbox class="tab-label-container"
                  onoverflow="this.setAttribute('textoverflow', 'true');"
                  onunderflow="this.removeAttribute('textoverflow');" flex="1">
              <label class="tab-text tab-label" role="presentation"></label>
            </hbox>
            <toolbarbutton tabindex="-1" clickthrough="never"
                           class="tab-close-button close-icon">
            </toolbarbutton>
          </hbox>
        </stack>
      `, ["chrome://messenger/locale/tabmail.dtd"]));

      this.addEventListener("mouseover", (event) => {
        document.tab = this;
        if (event.originalTarget.classList.contains("tab-close-button")) {
          this.mOverCloseButton = true;
        }
      });

      this.addEventListener("dragstart", (event) => {
        document.dragTab = this;
      }, true);

      this.addEventListener("dragover", (event) => {
        document.dragTab = null;
      }, true);

      this.addEventListener("mouseout", (event) => {
        document.tab = null;
        if (event.originalTarget.classList.contains("tab-close-button")) {
          this.mOverCloseButton = false;
        }
      });

      this.addEventListener("mousedown", (event) => {
        if (event.button != 0) {
          return;
        }

        if (this.mOverCloseButton) {
          event.stopPropagation();
        }
      }, true);

      this.addEventListener("contextmenu", (event) => {
        document.popupNode = this;
      }, true);

      this.mOverCloseButton = false;

      this.setAttribute("context", "tabContextMenu");

      this.mCorrespondingMenuitem = null;

      this.initializeAttributeInheritance();
    }

    get linkedBrowser() {
      let tabmail = document.getElementById("tabmail");
      let tab = tabmail._getTabContextForTabbyThing(this, false)[1];
      return tabmail.getBrowserForTab(tab);
    }

    get mode() {
      let tabmail = document.getElementById("tabmail");
      let tab = tabmail._getTabContextForTabbyThing(this, false)[1];
      return tab.mode;
    }
  }

  MozXULElement.implementCustomInterface(MozTabmailTab, [Ci.nsIDOMXULSelectControlItemElement]);

  customElements.define("tabmail-tab", MozTabmailTab, { extends: "tab" });
}
