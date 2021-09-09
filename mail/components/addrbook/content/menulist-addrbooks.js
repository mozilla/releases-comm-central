/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// The menulist CE is defined lazily. Create one now to get menulist defined,
// allowing us to inherit from it.
if (!customElements.get("menulist")) {
  delete document.createXULElement("menulist");
}

// Wrap in a block to prevent leaking to window scope.
{
  const { MailServices } = ChromeUtils.import(
    "resource:///modules/MailServices.jsm"
  );
  const { Services } = ChromeUtils.import(
    "resource://gre/modules/Services.jsm"
  );
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

      this._rebuild();

      // Store as a member of `this` so there's a strong reference.
      this.addressBookListener = {
        QueryInterface: ChromeUtils.generateQI([
          "nsIObserver",
          "nsISupportsWeakReference",
        ]),

        observe: (subject, topic, data) => {
          // Test-only reload of the address book manager.
          if (topic == "addrbook-reloaded") {
            this._rebuild();
            return;
          }

          subject.QueryInterface(Ci.nsIAbDirectory);

          switch (topic) {
            case "addrbook-directory-created": {
              if (this._matches(subject)) {
                this._rebuild();
              }
              break;
            }
            case "addrbook-directory-updated": {
              // Find the item in the list to rename.
              // We can't use indexOf here because we need loose equality.
              let len = this._directories.length;
              for (var oldIndex = len - 1; oldIndex >= 0; oldIndex--) {
                if (this._directories[oldIndex] == subject) {
                  break;
                }
              }
              if (oldIndex != -1) {
                this._rebuild();
              }
              break;
            }
            case "addrbook-directory-deleted": {
              // Find the item in the list to remove.
              // We can't use indexOf here because we need loose equality.
              let len = this._directories.length;
              for (var index = len - 1; index >= 0; index--) {
                if (this._directories[index] == subject) {
                  break;
                }
              }
              if (index != -1) {
                this._directories.splice(index, 1);
                // Are we removing the selected directory?
                if (
                  this.selectedItem ==
                  this.menupopup.removeChild(this.menupopup.children[index])
                ) {
                  // If so, try to select the first directory, if available.
                  if (this.menupopup.hasChildNodes()) {
                    this.menupopup.firstElementChild.doCommand();
                  } else {
                    this.selectedItem = null;
                  }
                }
              }
              break;
            }
          }
        },
      };

      for (let topic of [
        "addrbook-directory-created",
        "addrbook-directory-updated",
        "addrbook-directory-deleted",
        "addrbook-reloaded",
      ]) {
        Services.obs.addObserver(this.addressBookListener, topic, true);
      }
    }

    /**
     * Returns the address book type based on the remoteonly attribute
     * of the menulist.
     *
     * "URI"         Local Address Book
     * "dirPrefId"   Remote LDAP Directory
     */
    get _type() {
      return this.getAttribute("remoteonly") ? "dirPrefId" : "URI";
    }

    disconnectedCallback() {
      super.disconnectedCallback();
      this._teardown();
    }

    _rebuild() {
      // Init the address book cache.
      this._directories.length = 0;

      for (let ab of MailServices.ab.directories) {
        if (this._matches(ab)) {
          this._directories.push(ab);

          if (this.getAttribute("mailinglists") == "true") {
            // Also append contained mailinglists.
            for (let list of ab.childNodes) {
              if (this._matches(list)) {
                this._directories.push(list);
              }
            }
          }
        }
      }

      this._teardown();

      if (this.hasAttribute("none")) {
        // Create a dummy menuitem representing no selection.
        this._directories.unshift(null);
        let listItem = this.appendItem(this.getAttribute("none"), "");
        listItem.setAttribute("class", "menuitem-iconic abMenuItem");
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
        listItem.setAttribute(
          "image",
          "chrome://messenger/skin/icons/address.svg"
        );
      }

      // Now create menuitems for all displayed directories.
      let type = this._type;
      for (let ab of this._directories) {
        if (!ab) {
          // Skip the empty members added above.
          continue;
        }

        let listItem = this.appendItem(ab.dirName, ab[type]);
        listItem.setAttribute("class", "menuitem-iconic abMenuItem");

        // Style the items by type.
        if (ab.isMailList) {
          listItem.setAttribute(
            "image",
            "chrome://messenger/skin/icons/ablist.svg"
          );
        } else if (ab.isRemote && ab.isSecure) {
          listItem.setAttribute(
            "image",
            "chrome://messenger/skin/icons/globe-secure.svg"
          );
        } else if (ab.isRemote) {
          listItem.setAttribute(
            "image",
            "chrome://messenger/skin/icons/globe.svg"
          );
        } else {
          listItem.setAttribute(
            "image",
            "chrome://messenger/skin/icons/address.svg"
          );
        }
      }

      // Attempt to select the persisted or otherwise first directory.
      this.selectedIndex = this._directories.findIndex(d => {
        return d && d[type] == this.value;
      });

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
      if (
        this.getAttribute("supportsmaillists") == "true" &&
        !ab.supportsMailingLists
      ) {
        return false;
      }

      return (
        this.getAttribute(ab.isRemote ? "localonly" : "remoteonly") != "true"
      );
    }
  }

  customElements.define("menulist-addrbooks", MozMenulistAddrbooks, {
    extends: "menulist",
  });
}
