/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global MozElements */

// Wrap in a block to prevent leaking to window scope.
{
  /**
   * The MozMapList widget behaves as a popup menu showing available map options
   * for an address. It is a part of the card view in the addressbook.
   *
   * @augments {MozElements.MozMenuPopup}
   */
  class MozMapList extends MozElements.MozMenuPopup {
    connectedCallback() {
      if (this.delayConnectedCallback() || this.hasConnected) {
        return;
      }
      this.setAttribute("is", "map-list");

      this.addEventListener("command", event => {
        this._chooseMapService(event.target);
        event.stopPropagation();
      });

      this.addEventListener("popupshowing", () => {
        this._listMapServices();
      });

      this._setWidgetDisabled(true);
    }

    get mapURL() {
      return this._createMapItURL();
    }

    /**
     * Initializes the necessary address data from an addressbook card.
     *
     * @param {nsIAbCard} card - The card to get the address data from.
     * @param {string} addrPrefix - Card property prefix: "Home" or "Work",
     *    to make the map use either HomeAddress or WorkAddress.
     */
    initMapAddressFromCard(card, addrPrefix) {
      const mapItURLFormat = this._getMapURLPref();
      const doNotShowMap = !mapItURLFormat || !addrPrefix || !card;
      this._setWidgetDisabled(doNotShowMap);
      if (doNotShowMap) {
        return;
      }

      this.address1 = card.getProperty(addrPrefix + "Address");
      this.address2 = card.getProperty(addrPrefix + "Address2");
      this.city = card.getProperty(addrPrefix + "City");
      this._state = card.getProperty(addrPrefix + "State");
      this.zip = card.getProperty(addrPrefix + "ZipCode");
      this.country = card.getProperty(addrPrefix + "Country");
    }

    /**
     * Sets the disabled/enabled state of the parent widget (e.g. a button).
     */
    _setWidgetDisabled(disabled) {
      this.parentNode.disabled = disabled;
    }

    /**
     * Returns the Map service URL from localized pref. Returns null if there
     * is none at the given index.
     *
     * @param {integer} [index=0] - The index of the service to return.
     *   0 is the default service.
     */
    _getMapURLPref(index = 0) {
      let url = null;
      if (!index) {
        url = Services.prefs.getComplexValue(
          "mail.addr_book.mapit_url.format",
          Ci.nsIPrefLocalizedString
        ).data;
      } else {
        try {
          url = Services.prefs.getComplexValue(
            "mail.addr_book.mapit_url." + index + ".format",
            Ci.nsIPrefLocalizedString
          ).data;
        } catch (e) {}
      }

      return url;
    }

    /**
     * Builds menuitem elements representing map services defined in prefs
     * and attaches them to the specified button.
     */
    _listMapServices() {
      let index = 1;
      let itemFound = true;
      let defaultFound = false;
      const kUserIndex = 100;
      const mapList = this;
      while (mapList.hasChildNodes()) {
        mapList.lastChild.remove();
      }

      const defaultUrl = this._getMapURLPref();

      // Creates the menuitem with supplied data.
      function addMapService(url, name) {
        const item = document.createXULElement("menuitem");
        item.setAttribute("url", url);
        item.setAttribute("label", name);
        item.setAttribute("type", "radio");
        item.setAttribute("name", "mapit_service");
        if (url == defaultUrl) {
          item.setAttribute("checked", "true");
        }
        mapList.appendChild(item);
      }

      // Generates a useful generic name by cutting out only the host address.
      function generateName(url) {
        return new URL(url).hostname;
      }

      // Add all defined map services as menuitems.
      while (itemFound) {
        let urlName;
        const urlTemplate = this._getMapURLPref(index);
        if (!urlTemplate) {
          itemFound = false;
        } else {
          // Name is not mandatory, generate one if not found.
          try {
            urlName = Services.prefs.getComplexValue(
              "mail.addr_book.mapit_url." + index + ".name",
              Ci.nsIPrefLocalizedString
            ).data;
          } catch (e) {
            urlName = generateName(urlTemplate);
          }
        }
        if (itemFound) {
          addMapService(urlTemplate, urlName);
          index++;
          if (urlTemplate == defaultUrl) {
            defaultFound = true;
          }
        } else if (index < kUserIndex) {
          // After iterating the base region provided urls, check for user defined ones.
          index = kUserIndex;
          itemFound = true;
        }
      }
      if (!defaultFound) {
        // If user had put a customized map URL into mail.addr_book.mapit_url.format
        // preserve it as a new map service named with the URL.
        // 'index' now points to the first unused entry in prefs.
        const defaultName = generateName(defaultUrl);
        addMapService(defaultUrl, defaultName);
        Services.prefs.setCharPref(
          "mail.addr_book.mapit_url." + index + ".format",
          defaultUrl
        );
        Services.prefs.setCharPref(
          "mail.addr_book.mapit_url." + index + ".name",
          defaultName
        );
      }
    }

    /**
     * Save user selected mapping service.
     *
     * @param {Element} item - The chosen menuitem with map service.
     */
    _chooseMapService(item) {
      // Save selected URL as the default.
      const defaultUrl = Cc[
        "@mozilla.org/pref-localizedstring;1"
      ].createInstance(Ci.nsIPrefLocalizedString);
      defaultUrl.data = item.getAttribute("url");
      Services.prefs.setComplexValue(
        "mail.addr_book.mapit_url.format",
        Ci.nsIPrefLocalizedString,
        defaultUrl
      );
    }

    /**
     * Generate the map URL used to open the link on clicking the menulist button.
     *
     * @returns {urlFormat} - the map url generated from the address.
     */
    _createMapItURL() {
      let urlFormat = this._getMapURLPref();
      if (!urlFormat) {
        return null;
      }

      urlFormat = urlFormat.replace("@A1", encodeURIComponent(this.address1));
      urlFormat = urlFormat.replace("@A2", encodeURIComponent(this.address2));
      urlFormat = urlFormat.replace("@CI", encodeURIComponent(this.city));
      urlFormat = urlFormat.replace("@ST", encodeURIComponent(this._state));
      urlFormat = urlFormat.replace("@ZI", encodeURIComponent(this.zip));
      urlFormat = urlFormat.replace("@CO", encodeURIComponent(this.country));

      return urlFormat;
    }
  }

  customElements.define("map-list", MozMapList, { extends: "menupopup" });
}
