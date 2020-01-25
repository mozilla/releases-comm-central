/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

this.EXPORTED_SYMBOLS = ["MockFactory"];

var MockFactory = {
  _registeredComponents: {},
  /**
   * Register a mock to override target interfaces.
   * The target interface may be accessed though _genuine property of the mock.
   *
   * @param contractID The contract ID of the interface which is overridden by
                       the mock.
   *                   e.g. "@mozilla.org/messenger/account-manager;1"
   * @param mock An object which implements interfaces for the contract ID.
   * @param args       An array which is passed in the constructor of mock.
   *
   * @return           The UUID of the mock.
   */
  register(contractID, mock, args) {
    let uuid = Cc["@mozilla.org/uuid-generator;1"]
      .getService(Ci.nsIUUIDGenerator)
      .generateUUID()
      .toString();

    let originalCID = Components.manager.nsIComponentRegistrar.contractIDToCID(
      contractID
    );
    let originalFactory = Components.manager.getClassObject(
      Cc[contractID],
      Ci.nsIFactory
    );

    let factory = {
      createInstance(outer, iid) {
        if (outer) {
          do_throw(Cr.NS_ERROR_NO_AGGREGATION);
        }

        let wrappedMock;
        if (mock.prototype && mock.prototype.constructor) {
          wrappedMock = new (mock.bind(null, args))();
        } else {
          wrappedMock = mock;
        }

        /*
         * Some interfaces fail to be created an instance since
         * the interface is not registered in xpcshell tests.
         * ex. nsIXULAppInfo.
         */
        try {
          let genuine = originalFactory.createInstance(outer, iid);
          wrappedMock._genuine = genuine;
        } catch (ex) {
          dump(ex);
        }

        return wrappedMock.QueryInterface(iid);
      },
      QueryInterface: ChromeUtils.generateQI([Ci.nsIFactory]),
    };

    Components.manager
      .QueryInterface(Ci.nsIComponentRegistrar)
      .registerFactory(
        Components.ID(uuid),
        "A Mock for " + contractID,
        contractID,
        factory
      );

    this._registeredComponents[uuid] = {
      contractID,
      originalCID,
      factory,
    };

    return uuid;
  },

  /**
   * Unregister the mock.
   *
   * @param uuid The UUID of the mock.
   */
  unregister(uuid) {
    if (!this._registeredComponents[uuid]) {
      return;
    }

    Components.manager
      .QueryInterface(Ci.nsIComponentRegistrar)
      .unregisterFactory(
        Components.ID(uuid),
        this._registeredComponents[uuid].factory
      );
    Components.manager
      .QueryInterface(Ci.nsIComponentRegistrar)
      .registerFactory(
        this._registeredComponents[uuid].originalCID,
        "",
        this._registeredComponents[uuid].contractID,
        null
      );

    delete this._registeredComponents[uuid];
  },

  unregisterAll() {
    for (let uuid in this._registeredComponents) {
      this.unregister(uuid);
    }
  },
};
