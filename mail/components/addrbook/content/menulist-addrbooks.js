/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

 // The menulist CE is defined lazily. Create one now to get menulist defined,
// allowing us to inherit from it.
if (!customElements.get("menulist")) {
  delete document.createElement("menulist");
}

customElements.whenDefined("menulist").then(() => {
  const { MailServices } = ChromeUtils.import("resource:///modules/MailServices.jsm");
  const { fixIterator } = ChromeUtils.import("resource:///modules/iteratorUtils.jsm");
  /**
   * MozMenulistAddrbooks is a menulist widget that is automatically
   * populated with the complete address book list.
   * @extends {MozMenuList}
   */
  class MozMenulistAddrbooks extends customElements.get("menulist") {
    connectedCallback() {
      super.connectedCallback();
      if (this.delayConnectedCallback()) {
        return;
      }

      if (this.menupopup) {
        return;
      }

      this._directories = [];
      this._value = this.getAttribute("value") || "URI";

      this._rebuild();

      // @implements {nsIAbListener}
      this.addressBookListener = {
        onItemAdded: (aParentDir, aItem) => {
          // Are we interested in this new directory?
          if (aItem instanceof Ci.nsIAbDirectory && this._matches(aItem)) {
            this._rebuild();
          }
        },

        onItemRemoved: (aParentDir, aItem) => {
          if (aItem instanceof Ci.nsIAbDirectory) {
            // Find the item in the list to remove.
            // We can't use indexOf here because we need loose equality.
            for (var index = this._directories.length; --index >= 0;) {
              if (this._directories[index] == aItem) {
                break;
              }
            }
            if (index != -1) {
              this._directories.splice(index, 1);
              // Are we removing the selected directory?
              if (this.selectedItem ==
                this.menupopup.removeChild(
                  this.menupopup.childNodes[index])) {
                // If so, try to select the first directory, if available.
                if (this.menupopup.hasChildNodes()) {
                  this.menupopup.firstChild.doCommand();
                } else {
                  this.selectedItem = null;
                }
              }
            }
          }
        },

        onItemPropertyChanged: (aItem, aProperty, aOldValue, aNewValue) => {
          if (aItem instanceof Ci.nsIAbDirectory) {
            // Find the item in the list to rename.
            // We can't use indexOf here because we need loose equality.
            for (var oldIndex = this._directories.length; --oldIndex >= 0;) {
              if (this._directories[oldIndex] == aItem) {
                break;
              }
            }
            if (oldIndex != -1) {
              this._rebuild();
            }
          }
        },
      };

      MailServices.ab.addAddressBookListener(this.addressBookListener, Ci.nsIAbListener.all);

      this._onUnload = () => {
        MailServices.ab.removeAddressBookListener(this.addressBookListener);
      };
      window.addEventListener("unload", this._onUnload);
    }

    disconnectedCallback() {
      super.disconnectedCallback();

      window.removeEventListener("unload", this._onUnload);
      MailServices.ab.removeAddressBookListener(this.addressBookListener);
    }

    _rebuild(aSelectValue) {
      // Init the address book cache.
      this._directories.length = 0;
      let directories = MailServices.ab.directories;

      while (directories && directories.hasMoreElements()) {
        let ab = directories.getNext();
        if ((ab instanceof Ci.nsIAbDirectory) && this._matches(ab)) {
          this._directories.push(ab);

          if (this.getAttribute("mailinglists") == "true") {
            // Also append contained mailinglists.
            for (let list of fixIterator(ab.childNodes, Ci.nsIAbDirectory)) {
              if (this._matches(list)) {
                this._directories.push(list);
              }
            }
          }
        }
      }

      this._sort();
      this._teardown();

      if (this.hasAttribute("none")) {
        // Create a dummy menuitem representing no selection.
        this._directories.unshift(null);
        let listItem = this.appendItem(this.getAttribute("none"), "");
        listItem.setAttribute("class", "menuitem-iconic abMenuItem");
        listItem.setAttribute("IsNone", "true");
      }

      if (this.hasAttribute("alladdressbooks")) {
        // Insert a menuitem representing All Addressbooks.
        let allABLabel = this.getAttribute("alladdressbooks");
        if (allABLabel == "true") {
          let bundle = document.getElementById("bundle_addressBook");
          allABLabel = bundle.getString("allAddressBooks");
        }

        this._directories.unshift(null);
        let listItem = this.appendItem(allABLabel, "moz-abdirectory://?");
        listItem.setAttribute("class", "menuitem-iconic abMenuItem");
        listItem.setAttribute("AddrBook", "true");
        listItem.setAttribute("IsAllAB", "true");
      }

      // Now create menuitems for all displayed directories.
      for (let ab of this._directories) {
        if (!ab) {
          // Skip the empty members added above.
          continue;
        }

        let listItem = this.appendItem(ab.dirName, ab.URI);
        listItem.setAttribute("class", "menuitem-iconic abMenuItem");

        // Style the items by type.
        if (ab.isMailList) {
          listItem.setAttribute("MailList", "true");
        } else {
          listItem.setAttribute("AddrBook", "true");
        }

        if (ab.isRemote) {
          listItem.setAttribute("IsRemote", "true");
        }
        if (ab.isSecure) {
          listItem.setAttribute("IsSecure", "true");
        }
      }

      // Attempt to select the persisted or otherwise first directory.
      this.value = aSelectValue;
      if (!this.selectedItem && this.menupopup.hasChildNodes()) {
        this.selectedIndex = 0;
      }
    }

    _teardown() {
      // Empty out anything in the list.
      while (this.menupopup && this.menupopup.hasChildNodes()) {
        this.menupopup.lastChild.remove();
      }
    }

    _matches(ab) {
      // This condition is used for instance when creating cards
      if (this.getAttribute("writable") == "true" && ab.readOnly) {
        return false;
      }

      // This condition is used for instance when creating mailing lists
      if (this.getAttribute("supportsmaillists") == "true" &&
        !ab.supportsMailingLists) {
        return false;
      }

      return this.getAttribute(ab.isRemote ? "localonly" : "remoteonly") != "true";
    }

    _sort() {
      let lists = {};
      let lastAB;
      // If there are any mailing lists, pull them out of the array temporarily.
      for (let d = 0; d < this._directories.length; d++) {
        if (this._directories[d].isMailList) {
          let [list] = this._directories.splice(d, 1);
          if (!(lastAB in lists)) {
            lists[lastAB] = [];
          }
          lists[lastAB].push(list);
          d--;
        } else {
          lastAB = this._directories[d].URI;
        }
      }

      this._directories.sort(this._compare);

      // Push mailing lists back appending them after their respective
      // containing addressbook.
      for (let d = this._directories.length - 1; d >= 0; d--) {
        let abURI = this._directories[d].URI;
        if (abURI in lists) {
          lists[abURI].sort(function(a, b) {
            return a.dirName.localeCompare(b.dirName);
          });
          let listIndex = d;
          for (let list of lists[abURI]) {
            listIndex++;
            this._directories.splice(listIndex, 0, list);
          }
          delete lists[abURI];
        }
      }
    }

    _compare(a, b) {
      // Null at the very top.
      if (!a) {
        return -1;
      }

      if (!b) {
        return 1;
      }

      // Personal at the top.
      const kPersonalAddressbookURI = "moz-abmdbdirectory://abook.mab";
      if (a.URI == kPersonalAddressbookURI) {
        return -1;
      }

      if (b.URI == kPersonalAddressbookURI) {
        return 1;
      }

      // Collected at the bottom.
      const kCollectedAddressbookURI = "moz-abmdbdirectory://history.mab";
      if (a.URI == kCollectedAddressbookURI) {
        return 1;
      }

      if (b.URI == kCollectedAddressbookURI) {
        return -1;
      }

      // Sort books of the same type by name.
      if (a.dirType == b.dirType) {
        return a.dirName.localeCompare(b.dirName);
      }

      // If one of the dirTypes is PAB and the other is something else,
      // then the other will go below the one of type PAB.
      const PABDirectory = 2;
      if (a.dirType == PABDirectory) {
        return -1;
      }

      if (b.dirType == PABDirectory) {
        return 1;
      }

      // Sort anything else by the dir type.
      return a.dirType - b.dirType;
    }
  }

  customElements.define("menulist-addrbooks",
    MozMenulistAddrbooks, { extends: "menulist" });
});
