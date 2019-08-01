/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global MozElements, MozXULElement */

{
  /**
   * The MozTabmailAlltabsMenuPopup widget is used as a menupopup to list all the
   * currently opened tabs.
   *
   * @extends {MozElements.MozMenuPopup}
   * @implements {EventListener}
   */
  class MozTabmailAlltabsMenuPopup extends MozElements.MozMenuPopup {
    connectedCallback() {
      if (this.delayConnectedCallback() || this.hasChildNodes()) {
        return;
      }

      this.tabmail = document.getElementById("tabmail");

      this._mutationObserver = new MutationObserver((records, observer) => {
        records.forEach((mutation) => {
          let menuItem = mutation.target.mCorrespondingMenuitem;
          if (menuItem) {
            this._setMenuitemAttributes(menuItem, mutation.target);
          }
        });
      });

      this.addEventListener("popupshowing", (event) => {
        // Set up the menu popup.
        let tabcontainer = this.tabmail.tabContainer;
        let tabs = tabcontainer.allTabs;

        // Listen for changes in the tab bar.
        this._mutationObserver.observe(tabcontainer, {
          attributes: true,
          subtree: true,
          attributeFilter: ["label", "crop", "busy", "image", "selected"],
        });

        this.tabmail.addEventListener("TabOpen", this);
        tabcontainer.arrowScrollbox.addEventListener("scroll", this);

        // If an animation is in progress and the user
        // clicks on the "all tabs" button, stop the animation.
        tabcontainer._stopAnimation();

        for (let i = 0; i < tabs.length; i++) {
          this._createTabMenuItem(tabs[i]);
        }
        this._updateTabsVisibilityStatus();
      });

      this.addEventListener("popuphiding", (event) => {
        // Clear out the menu popup and remove the listeners.
        while (this.hasChildNodes()) {
          let menuItem = this.lastChild;
          menuItem.removeEventListener("command", this);
          menuItem.tab.removeEventListener("TabClose", this);
          menuItem.tab.mCorrespondingMenuitem = null;
          menuItem.remove();
        }
        this._mutationObserver.disconnect();

        this.tabmail.tabContainer.arrowScrollbox.removeEventListener("scroll", this);
        this.tabmail.removeEventListener("TabOpen", this);
      });
    }

    _menuItemOnCommand(aEvent) {
      this.tabmail.tabContainer.selectedItem = aEvent.target.tab;
    }

    _tabOnTabClose(aEvent) {
      let menuItem = aEvent.target.mCorrespondingMenuitem;
      if (menuItem) {
        menuItem.remove();
      }
    }

    handleEvent(aEvent) {
      if (!aEvent.isTrusted) {
        return;
      }

      switch (aEvent.type) {
        case "command":
          this._menuItemOnCommand(aEvent);
          break;
        case "TabClose":
          this._tabOnTabClose(aEvent);
          break;
        case "TabOpen":
          this._createTabMenuItem(aEvent.originalTarget);
          break;
        case "scroll":
          this._updateTabsVisibilityStatus();
          break;
      }
    }

    _updateTabsVisibilityStatus() {
      let tabStrip = this.tabmail.tabContainer.arrowScrollbox;
      // We don't want menu item decoration unless there is overflow.
      if (tabStrip.getAttribute("notoverflowing") == "true") {
        return;
      }

      let tabStripBox = tabStrip.getBoundingClientRect();

      for (let i = 0; i < this.childNodes.length; i++) {
        let currentTabBox = this.childNodes[i].tab.getBoundingClientRect();

        if (currentTabBox.left >= tabStripBox.left &&
            currentTabBox.right <= tabStripBox.right) {
          this.childNodes[i].setAttribute("tabIsVisible", "true");
        } else {
          this.childNodes[i].removeAttribute("tabIsVisible");
        }
      }
    }

    _createTabMenuItem(aTab) {
      let menuItem = document.createXULElement("menuitem");

      menuItem.setAttribute("class", "menuitem-iconic alltabs-item menuitem-with-favicon");

      this._setMenuitemAttributes(menuItem, aTab);

      // Keep some attributes of the menuitem in sync with its
      // corresponding tab (e.g. the tab label).
      aTab.mCorrespondingMenuitem = menuItem;
      aTab.addEventListener("TabClose", this);
      menuItem.tab = aTab;
      menuItem.addEventListener("command", this);

      this.appendChild(menuItem);
      return menuItem;
    }

    _setMenuitemAttributes(aMenuitem, aTab) {
      aMenuitem.setAttribute("label", aTab.label);
      aMenuitem.setAttribute("crop", "end");

      if (aTab.hasAttribute("busy")) {
        aMenuitem.setAttribute("busy", aTab.getAttribute("busy"));
        aMenuitem.removeAttribute("image");
      } else {
        aMenuitem.setAttribute("image", aTab.getAttribute("image"));
        aMenuitem.removeAttribute("busy");
      }

      // Change the tab icon accordingly.
      let style = window.getComputedStyle(aTab);
      aMenuitem.style.listStyleImage = style.listStyleImage;
      aMenuitem.style.MozImageRegion = style.MozImageRegion;

      if (aTab.hasAttribute("pending")) {
        aMenuitem.setAttribute("pending", aTab.getAttribute("pending"));
      } else {
        aMenuitem.removeAttribute("pending");
      }

      if (aTab.selected) {
        aMenuitem.setAttribute("selected", "true");
      } else {
        aMenuitem.removeAttribute("selected");
      }
    }
  }

  customElements.define("tabmail-alltabs-menupopup", MozTabmailAlltabsMenuPopup,
    { "extends": "menupopup" });
}
