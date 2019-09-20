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
          <stack class="tab-stack" flex="1" closetabtext="&closeTab.label;">
            <vbox class="tab-background">
              <hbox class="tab-line"></hbox>
            </vbox>
            <hbox class="tab-content" align="center">
              <image class="tab-throbber" role="presentation"></image>
              <image class="tab-icon-image" role="presentation"></image>
              <hbox class="tab-label-container"
                    onoverflow="this.setAttribute('textoverflow', 'true');"
                    onunderflow="this.removeAttribute('textoverflow');"
                    flex="1">
                <label class="tab-text tab-label" role="presentation"></label>
              </hbox>
              <image class="tab-close-button close-icon"/>
            </hbox>
          </stack>
          `,
          ["chrome://messenger/locale/tabmail.dtd"]
        )
      );

      this.addEventListener("mouseover", event => {
        document.tab = this;
        if (event.originalTarget.classList.contains("tab-close-button")) {
          this.mOverCloseButton = true;
        }
      });

      this.addEventListener(
        "dragstart",
        event => {
          document.dragTab = this;
        },
        true
      );

      this.addEventListener(
        "dragover",
        event => {
          document.dragTab = null;
        },
        true
      );

      this.addEventListener("mouseout", event => {
        document.tab = null;
        if (event.originalTarget.classList.contains("tab-close-button")) {
          this.mOverCloseButton = false;
        }
      });

      this.addEventListener(
        "mousedown",
        event => {
          if (event.button != 0) {
            return;
          }

          if (this.mOverCloseButton) {
            event.stopPropagation();
          }
        },
        true
      );

      this.addEventListener("click", event => {
        if (event.button != 0) {
          return;
        }
        if (!event.originalTarget.classList.contains("tab-close-button")) {
          return;
        }

        let tabbedBrowser = document.getElementById("tabmail");
        if (this.localName == "tab") {
          // The only sequence in which a second click event (i.e. dblclik)
          // can be dispatched on an in-tab close button is when it is shown
          // after the first click (i.e. the first click event was dispatched
          // on the tab). This happens when we show the close button only on
          // the active tab. (bug 352021)
          // The only sequence in which a third click event can be dispatched
          // on an in-tab close button is when the tab was opened with a
          // double click on the tabbar. (bug 378344)
          // In both cases, it is most likely that the close button area has
          // been accidentally clicked, therefore we do not close the tab.
          if (event.detail > 1) {
            return;
          }

          tabbedBrowser.removeTabByNode(this);
          tabbedBrowser._blockDblClick = true;
          let tabContainer = tabbedBrowser.tabContainer;

          // XXXmano hack (see bug 343628):
          // Since we're removing the event target, if the user
          // double-clicks this button, the dblclick event will be dispatched
          // with the tabbar as its event target (and explicit/originalTarget),
          // which treats that as a mouse gesture for opening a new tab.
          // In this context, we're manually blocking the dblclick event
          // (see onTabBarDblClick).
          let clickedOnce = false;
          let enableDblClick = function enableDblClick(event) {
            let target = event.originalTarget;
            if (target.classList.contains("tab-close-button")) {
              target._ignoredClick = true;
            }
            if (!clickedOnce) {
              clickedOnce = true;
              return;
            }
            tabContainer._blockDblClick = false;
            tabContainer.removeEventListener("click", enableDblClick, true);
          };
          tabContainer.addEventListener("click", enableDblClick, true);
        } else {
          // "tabs"
          tabbedBrowser.removeCurrentTab();
        }
      });

      this.addEventListener(
        "contextmenu",
        event => {
          document.popupNode = this;
        },
        true
      );

      this.addEventListener(
        "dblclick",
        event => {
          if (event.button != 0) {
            return;
          }
          // for the one-close-button case
          event.stopPropagation();
        },
        true
      );

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

  MozXULElement.implementCustomInterface(MozTabmailTab, [
    Ci.nsIDOMXULSelectControlItemElement,
  ]);

  customElements.define("tabmail-tab", MozTabmailTab, { extends: "tab" });
}
