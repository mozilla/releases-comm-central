/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global MozElements, MozXULElement */

// Wrap in a block to prevent leaking to window scope.
{
  const { XPCOMUtils } = ChromeUtils.importESModule(
    "resource://gre/modules/XPCOMUtils.sys.mjs"
  );

  /**
   * The MozTabs widget holds all the tabs for the main tab UI.
   *
   * @augments {MozTabs}
   */
  class MozTabmailTabs extends customElements.get("tabs") {
    constructor() {
      super();

      this.addEventListener("dragstart", event => {
        const draggedTab = this._getDragTargetTab(event);

        if (!draggedTab) {
          return;
        }

        const tab = this.tabmail.selectedTab;

        if (!tab || !tab.canClose) {
          return;
        }

        let dt = event.dataTransfer;

        // If we drag within the same window, we use the tab directly
        dt.mozSetDataAt("application/x-moz-tabmail-tab", draggedTab, 0);

        // Otherwise we use session restore & JSON to migrate the tab.
        let uri = this.tabmail.persistTab(tab);

        // In case the tab implements session restore, we use JSON to convert
        // it into a string.
        //
        // If a tab does not support session restore it returns null. We can't
        // moved such tabs to a new window. However moving them within the same
        // window works perfectly fine.
        if (uri) {
          uri = JSON.stringify(uri);
        }

        dt.mozSetDataAt("application/x-moz-tabmail-json", uri, 0);

        dt.mozCursor = "default";

        // Create Drag Image.
        const panel = document.getElementById("tabpanelcontainer");

        const thumbnail = document.createElementNS(
          "http://www.w3.org/1999/xhtml",
          "canvas"
        );
        thumbnail.width = Math.ceil(screen.availWidth / 5.75);
        thumbnail.height = Math.round(thumbnail.width * 0.5625);

        const snippetWidth = panel.getBoundingClientRect().width * 0.6;
        const scale = thumbnail.width / snippetWidth;

        const ctx = thumbnail.getContext("2d");

        ctx.scale(scale, scale);

        ctx.drawWindow(
          window,
          panel.screenX - window.mozInnerScreenX,
          panel.screenY - window.mozInnerScreenY,
          snippetWidth,
          snippetWidth * 0.5625,
          "rgb(255,255,255)"
        );

        dt = event.dataTransfer;
        dt.setDragImage(thumbnail, 0, 0);

        event.stopPropagation();
      });

      this.addEventListener("dragover", event => {
        const dt = event.dataTransfer;

        if (dt.mozItemCount == 0) {
          return;
        }

        // Bug 516247:
        // in case the user is dragging something else than a tab, and
        // keeps hovering over a tab, we assume he wants to switch to this tab.
        if (
          dt.mozTypesAt(0)[0] != "application/x-moz-tabmail-tab" &&
          dt.mozTypesAt(0)[1] != "application/x-moz-tabmail-json"
        ) {
          const tab = this._getDragTargetTab(event);

          if (!tab) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();

          if (!this._dragTime) {
            this._dragTime = Date.now();
            return;
          }

          if (Date.now() <= this._dragTime + this._dragOverDelay) {
            return;
          }

          if (this.tabmail.tabContainer.selectedItem == tab) {
            return;
          }

          this.tabmail.tabContainer.selectedItem = tab;

          return;
        }

        // As some tabs do not support session restore they can't be
        // moved to a different or new window. We should not show
        // a dropmarker in such a case.
        if (!dt.mozGetDataAt("application/x-moz-tabmail-json", 0)) {
          const draggedTab = dt.mozGetDataAt(
            "application/x-moz-tabmail-tab",
            0
          );

          if (!draggedTab) {
            return;
          }

          if (this.tabmail.tabContainer.getIndexOfItem(draggedTab) == -1) {
            return;
          }
        }

        dt.effectAllowed = "copyMove";

        event.preventDefault();
        event.stopPropagation();

        const ltr = window.getComputedStyle(this).direction == "ltr";
        const ind = this._tabDropIndicator;
        const arrowScrollbox = this.arrowScrollbox;

        // Let's scroll
        let pixelsToScroll = 0;
        if (arrowScrollbox.getAttribute("overflow") == "true") {
          switch (event.target) {
            case arrowScrollbox._scrollButtonDown:
              pixelsToScroll = arrowScrollbox.scrollIncrement * -1;
              break;
            case arrowScrollbox._scrollButtonUp:
              pixelsToScroll = arrowScrollbox.scrollIncrement;
              break;
          }

          if (ltr) {
            pixelsToScroll = pixelsToScroll * -1;
          }

          if (pixelsToScroll) {
            // Hide Indicator while Scrolling
            ind.hidden = true;
            arrowScrollbox.scrollByPixels(pixelsToScroll);
            return;
          }
        }

        let newIndex = this._getDropIndex(event);

        // Fix the DropIndex in case it points to tab that can't be closed.
        const tabInfo = this.tabmail.tabInfo;

        while (newIndex < tabInfo.length && !tabInfo[newIndex].canClose) {
          newIndex++;
        }

        const scrollRect = this.arrowScrollbox.scrollClientRect;
        const rect = this.getBoundingClientRect();
        let minMargin = scrollRect.left - rect.left;
        let maxMargin = Math.min(
          minMargin + scrollRect.width,
          scrollRect.right
        );

        if (!ltr) {
          [minMargin, maxMargin] = [
            this.clientWidth - maxMargin,
            this.clientWidth - minMargin,
          ];
        }

        let newMargin;
        const tabs = this.allTabs;

        if (newIndex == tabs.length) {
          const tabRect = tabs[newIndex - 1].getBoundingClientRect();

          if (ltr) {
            newMargin = tabRect.right - rect.left;
          } else {
            newMargin = rect.right - tabRect.left;
          }
        } else {
          const tabRect = tabs[newIndex].getBoundingClientRect();

          if (ltr) {
            newMargin = tabRect.left - rect.left;
          } else {
            newMargin = rect.right - tabRect.right;
          }
        }

        ind.hidden = false;

        newMargin -= ind.clientWidth / 2;

        ind.style.insetInlineStart = `${Math.round(newMargin)}px`;
      });

      this.addEventListener("drop", event => {
        const dt = event.dataTransfer;

        if (dt.mozItemCount != 1) {
          return;
        }

        let draggedTab = dt.mozGetDataAt("application/x-moz-tabmail-tab", 0);

        if (!draggedTab) {
          return;
        }

        event.stopPropagation();
        this._tabDropIndicator.hidden = true;

        // Is the tab one of our children?
        if (this.tabmail.tabContainer.getIndexOfItem(draggedTab) == -1) {
          // It's a tab from an other window, so we have to trigger session
          // restore to get our tab

          const tabmail2 = draggedTab.ownerDocument.getElementById("tabmail");
          if (!tabmail2) {
            return;
          }

          let draggedJson = dt.mozGetDataAt(
            "application/x-moz-tabmail-json",
            0
          );
          if (!draggedJson) {
            return;
          }

          draggedJson = JSON.parse(draggedJson);

          // Some tab exist only once, so we have to gamble a bit. We close
          // the tab and try to reopen it. If something fails the tab is gone.

          tabmail2.closeTab(draggedTab, true);

          if (!this.tabmail.restoreTab(draggedJson)) {
            return;
          }

          draggedTab =
            this.tabmail.tabContainer.allTabs[
              this.tabmail.tabContainer.allTabs.length - 1
            ];
        }

        let idx = this._getDropIndex(event);

        // Fix the DropIndex in case it points to tab that can't be closed
        const tabInfo = this.tabmail.tabInfo;
        while (idx < tabInfo.length && !tabInfo[idx].canClose) {
          idx++;
        }

        this.tabmail.moveTabTo(draggedTab, idx);

        this.tabmail.switchToTab(draggedTab);
        this.tabmail.updateCurrentTab();
      });

      this.addEventListener("dragend", event => {
        // Note: while this case is correctly handled here, this event
        // isn't dispatched when the tab is moved within the tabstrip,
        // see bug 460801.

        // The user pressed ESC to cancel the drag, or the drag succeeded.
        const dt = event.dataTransfer;
        if (dt.mozUserCancelled || dt.dropEffect != "none") {
          return;
        }

        // Disable detach within the browser toolbox.
        const eX = event.screenX;
        const wX = window.screenX;

        // Check if the drop point is horizontally within the window.
        if (eX > wX && eX < wX + window.outerWidth) {
          const bo = this.arrowScrollbox;
          // Also avoid detaching if the the tab was dropped too close to
          // the tabbar (half a tab).
          const endScreenY =
            bo.screenY + 1.5 * bo.getBoundingClientRect().height;
          const eY = event.screenY;

          if (eY < endScreenY && eY > window.screenY) {
            return;
          }
        }

        // User wants to deatach tab from window...
        if (dt.mozItemCount != 1) {
          return;
        }

        const draggedTab = dt.mozGetDataAt("application/x-moz-tabmail-tab", 0);

        if (!draggedTab) {
          return;
        }

        this.tabmail.replaceTabWithWindow(draggedTab);
      });

      this.addEventListener("dragleave", event => {
        this._dragTime = 0;

        this._tabDropIndicator.hidden = true;
        event.stopPropagation();
      });
    }

    connectedCallback() {
      if (this.delayConnectedCallback()) {
        return;
      }
      super.connectedCallback();

      this.tabmail = document.getElementById("tabmail");

      this.arrowScrollboxWidth = 0;

      this.arrowScrollbox = this.querySelector("arrowscrollbox");

      this.mCollapseToolbar = document.getElementById(
        this.getAttribute("collapsetoolbar")
      );

      // @implements {nsIObserver}
      this._prefObserver = (subject, topic, data) => {
        if (topic == "nsPref:changed") {
          subject.QueryInterface(Ci.nsIPrefBranch);
          if (data == "mail.tabs.autoHide") {
            this.mAutoHide = subject.getBoolPref("mail.tabs.autoHide");
          }
        }
      };

      this._tabDropIndicator = this.querySelector(".tab-drop-indicator");

      this._dragOverDelay = 350;

      this._dragTime = 0;

      this._mAutoHide = false;

      this.mAllTabsButton = document.getElementById(
        this.getAttribute("alltabsbutton")
      );
      this.mAllTabsPopup = this.mAllTabsButton.menu;

      this.mDownBoxAnimate = this.arrowScrollbox;

      this._animateTimer = null;

      this._animateStep = -1;

      this._animateDelay = 25;

      this._animatePercents = [
        1.0, 0.85, 0.8, 0.75, 0.71, 0.68, 0.65, 0.62, 0.59, 0.57, 0.54, 0.52,
        0.5, 0.47, 0.45, 0.44, 0.42, 0.4, 0.38, 0.37, 0.35, 0.34, 0.32, 0.31,
        0.3, 0.29, 0.28, 0.27, 0.26, 0.25, 0.24, 0.23, 0.23, 0.22, 0.22, 0.21,
        0.21, 0.21, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.19, 0.19, 0.19,
        0.18, 0.18, 0.17, 0.17, 0.16, 0.15, 0.14, 0.13, 0.11, 0.09, 0.06,
      ];

      this.mTabMinWidth = Services.prefs.getIntPref("mail.tabs.tabMinWidth");
      this.mTabMaxWidth = Services.prefs.getIntPref("mail.tabs.tabMaxWidth");
      this.mTabClipWidth = Services.prefs.getIntPref("mail.tabs.tabClipWidth");
      this.mAutoHide = Services.prefs.getBoolPref("mail.tabs.autoHide");

      if (this.mAutoHide) {
        this.mCollapseToolbar.collapsed = true;
        document.documentElement.setAttribute("tabbarhidden", "true");
      }

      this._updateCloseButtons();

      Services.prefs.addObserver("mail.tabs.", this._prefObserver);

      window.addEventListener("resize", this);

      // Listen to overflow/underflow events on the tabstrip,
      // we cannot put these as xbl handlers on the entire binding because
      // they would also get called for the all-tabs popup scrollbox.
      // Also, we can't rely on event.target because these are all
      // anonymous nodes.
      this.arrowScrollbox.shadowRoot.addEventListener("overflow", this);
      this.arrowScrollbox.shadowRoot.addEventListener("underflow", this);

      this.addEventListener("select", event => {
        this._handleTabSelect();

        if (
          !("updateCurrentTab" in this.tabmail) ||
          event.target.localName != "tabs"
        ) {
          return;
        }

        this.tabmail.updateCurrentTab();
      });

      this.addEventListener("TabSelect", event => {
        this._handleTabSelect();
      });
      XPCOMUtils.defineLazyPreferenceGetter(
        this,
        "_tabMinWidthPref",
        "mail.tabs.tabMinWidth",
        null,
        (pref, prevValue, newValue) => (this._tabMinWidth = newValue),
        newValue => {
          const LIMIT = 50;
          return Math.max(newValue, LIMIT);
        }
      );
      this._tabMinWidth = this._tabMinWidthPref;

      XPCOMUtils.defineLazyPreferenceGetter(
        this,
        "_tabMaxWidthPref",
        "mail.tabs.tabMaxWidth",
        null,
        (pref, prevValue, newValue) => (this._tabMaxWidth = newValue)
      );
      this._tabMaxWidth = this._tabMaxWidthPref;
    }

    get tabbox() {
      return document.getElementById("tabmail-tabbox");
    }

    // Accessor for tabs.
    get allTabs() {
      if (!this.arrowScrollbox) {
        return [];
      }

      return Array.from(this.arrowScrollbox.children);
    }

    appendChild(tab) {
      return this.insertBefore(tab, null);
    }

    insertBefore(tab, node) {
      if (!this.arrowScrollbox) {
        return;
      }

      if (node == null) {
        this.arrowScrollbox.appendChild(tab);
        return;
      }

      this.arrowScrollbox.insertBefore(tab, node);
    }

    set mAutoHide(val) {
      if (val != this._mAutoHide) {
        if (this.allTabs.length == 1) {
          this.mCollapseToolbar.collapsed = val;
        }
        this._mAutoHide = val;
      }
    }

    get mAutoHide() {
      return this._mAutoHide;
    }

    set selectedIndex(val) {
      const tab = this.getItemAtIndex(val);
      const alreadySelected = tab && tab.selected;

      this.__proto__.__proto__
        .__lookupSetter__("selectedIndex")
        .call(this, val);

      if (!alreadySelected) {
        // Fire an onselect event for the tabs element.
        const event = document.createEvent("Events");
        event.initEvent("select", true, true);
        this.dispatchEvent(event);
      }
    }

    get selectedIndex() {
      return this.__proto__.__proto__
        .__lookupGetter__("selectedIndex")
        .call(this);
    }

    _updateCloseButtons() {
      const width =
        this.arrowScrollbox.firstElementChild.getBoundingClientRect().width;
      // 0 width is an invalid value and indicates
      // an item without display, so ignore.
      if (width > this.mTabClipWidth || width == 0) {
        this.setAttribute("closebuttons", "alltabs");
      } else {
        this.setAttribute("closebuttons", "activetab");
      }
    }

    _handleTabSelect() {
      this.arrowScrollbox.ensureElementIsVisible(this.selectedItem);
    }

    handleEvent(aEvent) {
      const alltabsButton = document.getElementById("alltabs-button");

      switch (aEvent.type) {
        case "overflow":
          this.arrowScrollbox.ensureElementIsVisible(this.selectedItem);

          // filter overflow events which were dispatched on nested scrollboxes
          // and ignore vertical events.
          if (
            aEvent.target != this.arrowScrollbox.scrollbox ||
            aEvent.detail == 0
          ) {
            return;
          }

          this.arrowScrollbox.setAttribute("overflow", "true");
          alltabsButton.removeAttribute("hidden");
          break;
        case "underflow":
          // filter underflow events which were dispatched on nested scrollboxes
          // and ignore vertical events.
          if (
            aEvent.target != this.arrowScrollbox.scrollbox ||
            aEvent.detail == 0
          ) {
            return;
          }

          this.arrowScrollbox.removeAttribute("overflow");
          alltabsButton.setAttribute("hidden", "true");
          break;
        case "resize":
          const width = this.arrowScrollbox.getBoundingClientRect().width;
          if (width != this.arrowScrollboxWidth) {
            this._updateCloseButtons();
            // XXX without this line the tab bar won't budge
            this.arrowScrollbox.scrollByPixels(1);
            this._handleTabSelect();
            this.arrowScrollboxWidth = width;
          }
          break;
      }
    }

    _stopAnimation() {
      if (this._animateStep != -1) {
        if (this._animateTimer) {
          this._animateTimer.cancel();
        }

        this._animateStep = -1;
        this.mAllTabsBoxAnimate.style.opacity = 0.0;
        this.mDownBoxAnimate.style.opacity = 0.0;
      }
    }

    _notifyBackgroundTab(aTab) {
      const tsbo = this.arrowScrollbox;
      const tsboStart = tsbo.screenX;
      const tsboEnd = tsboStart + tsbo.getBoundingClientRect().width;

      const ctboStart = aTab.screenX;
      const ctboEnd = ctboStart + aTab.getBoundingClientRect().width;

      // only start the flash timer if the new tab (which was loaded in
      // the background) is not completely visible
      if (tsboStart > ctboStart || ctboEnd > tsboEnd) {
        this._animateStep = 0;

        if (!this._animateTimer) {
          this._animateTimer = Cc["@mozilla.org/timer;1"].createInstance(
            Ci.nsITimer
          );
        } else {
          this._animateTimer.cancel();
        }

        this._animateTimer.initWithCallback(
          this,
          this._animateDelay,
          Ci.nsITimer.TYPE_REPEATING_SLACK
        );
      }
    }

    notify(aTimer) {
      if (!document) {
        aTimer.cancel();
      }

      const percent = this._animatePercents[this._animateStep];
      this.mAllTabsBoxAnimate.style.opacity = percent;
      this.mDownBoxAnimate.style.opacity = percent;

      if (this._animateStep < this._animatePercents.length - 1) {
        this._animateStep++;
      } else {
        this._stopAnimation();
      }
    }

    _getDragTargetTab(event) {
      let tab = event.target;
      while (tab && tab.localName != "tab") {
        tab = tab.parentNode;
      }

      if (!tab) {
        return null;
      }

      if (event.type != "drop" && event.type != "dragover") {
        return tab;
      }

      const tabRect = tab.getBoundingClientRect();
      if (event.screenX < tab.screenX + tabRect.width * 0.25) {
        return null;
      }

      if (event.screenX > tab.screenX + tabRect.width * 0.75) {
        return null;
      }

      return tab;
    }

    _getDropIndex(event) {
      const tabs = this.allTabs;

      if (window.getComputedStyle(this).direction == "ltr") {
        for (let i = 0; i < tabs.length; i++) {
          if (
            event.screenX <
            tabs[i].screenX + tabs[i].getBoundingClientRect().width / 2
          ) {
            return i;
          }
        }
      } else {
        for (let i = 0; i < tabs.length; i++) {
          if (
            event.screenX >
            tabs[i].screenX + tabs[i].getBoundingClientRect().width / 2
          ) {
            return i;
          }
        }
      }

      return tabs.length;
    }

    set _tabMinWidth(val) {
      this.arrowScrollbox.style.setProperty("--tab-min-width", `${val}px`);
    }
    set _tabMaxWidth(val) {
      this.arrowScrollbox.style.setProperty("--tab-max-width", `${val}px`);
    }

    disconnectedCallback() {
      Services.prefs.removeObserver("mail.tabs.", this._prefObserver);

      // Release timer to avoid reference cycles.
      if (this._animateTimer) {
        this._animateTimer.cancel();
        this._animateTimer = null;
      }

      this.arrowScrollbox.shadowRoot.removeEventListener("overflow", this);
      this.arrowScrollbox.shadowRoot.removeEventListener("underflow", this);
    }
  }

  MozXULElement.implementCustomInterface(MozTabmailTabs, [Ci.nsITimerCallback]);
  customElements.define("tabmail-tabs", MozTabmailTabs, { extends: "tabs" });
}
