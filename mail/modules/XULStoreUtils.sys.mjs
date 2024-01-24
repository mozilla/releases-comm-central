/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Simple wrapper around the Services.xulStore methods to reduce the amount of
 * duplicated code and repeated store URLs across the application. In case the
 * xulStore API ever change, we will need to only touch this file.
 */

export const XULStoreUtils = {
  // List of all xul store URLs to use based on the called methods.
  _url: url => {
    switch (url) {
      case "addressBook":
        return "about:addressbook";
      case "messenger":
        return "chrome://messenger/content/messenger.xhtml";
      default:
        console.debug(`Unkown xulStore document URL: ${url}`);
        return url;
    }
  },

  /**
   * Store value for a specific attribute of an item.
   *
   * @param {string} url
   * @param {string} element
   * @param {string} attribute
   * @param {any} value
   */
  setValue(url, element, attribute, value) {
    Services.xulStore.setValue(this._url(url), element, attribute, value);
  },

  /**
   *
   * @param {string} url
   * @param {string} element
   * @param {string} attribute
   * @returns {any}
   */
  getValue(url, element, attribute) {
    return Services.xulStore.getValue(this._url(url), element, attribute);
  },

  /**
   * If the current item is stored as hidden in a specific url.
   *
   * @param {string} url
   * @param {string} item
   * @returns {boolean}
   */
  isItemHidden(url, item) {
    return Services.xulStore.getValue(this._url(url), item, "hidden") == "true";
  },

  /**
   * If the current item is stored as visible in a specific url.
   *
   * @param {string} url
   * @param {string} item
   * @returns {boolean}
   */
  isItemVisible(url, item) {
    return (
      Services.xulStore.getValue(this._url(url), item, "visible") == "true"
    );
  },

  /**
   * If the current item is stored as collapsed in a specific url.
   *
   * @param {string} url
   * @param {string} item
   * @returns {boolean}
   */
  isItemCollapsed(url, item) {
    return (
      Services.xulStore.getValue(this._url(url), item, "collapsed") == "true"
    );
  },

  /**
   * If the current item is stored as compact in a specific url.
   *
   * @param {string} url
   * @param {string} item
   * @returns {boolean}
   */
  isItemCompact(url, item) {
    return (
      Services.xulStore.getValue(this._url(url), item, "compact") == "true"
    );
  },
};
