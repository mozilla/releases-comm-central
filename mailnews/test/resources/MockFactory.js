this.EXPORTED_SYMBOLS = ["MockFactory"];

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cr = Components.results;
var Cm = Components.manager;

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
  register: function(contractID, mock, args) {
    let uuid = Cc["@mozilla.org/uuid-generator;1"]
                 .getService(Ci.nsIUUIDGenerator)
                 .generateUUID()
                 .toString();

    let originalCID = Cm.nsIComponentRegistrar.contractIDToCID(contractID);
    let originalFactory = Cm.getClassObject(Cc[contractID], Ci.nsIFactory);

    let factory = {
      createInstance: function(outer, iid) {
        if (outer)
          do_throw(Cr.NS_ERROR_NO_AGGREGATION);

        let wrappedMock;
        if (mock.prototype && mock.prototype.constructor)
          wrappedMock = new (mock.bind(null, args));
        else
          wrappedMock = mock;

        /*
         * Some interfaces fail to be created an instance since
         * the interface is not registered in xpcshell tests.
         * ex. nsIXULAppInfo.
         */
        try {
          let genuine = originalFactory.createInstance(outer, iid);
          wrappedMock._genuine = genuine;
        } catch(ex) {
          dump(ex);
        }

        return wrappedMock.QueryInterface(iid);
      },
      QueryInterface: XPCOMUtils.generateQI([Ci.nsIFactory])
    };

    Cm.QueryInterface(Ci.nsIComponentRegistrar)
      .registerFactory(Components.ID(uuid),
                       "A Mock for " + contractID,
                       contractID, factory);

    this._registeredComponents[uuid] = {
      contractID: contractID,
      originalCID: originalCID,
      factory: factory
    };

    return uuid;
  },

  /**
   * Unregister the mock.
   *
   * @param uuid The UUID of the mock.
   */
  unregister: function(uuid) {
    if (!this._registeredComponents[uuid])
      return;

    Cm.QueryInterface(Ci.nsIComponentRegistrar)
      .unregisterFactory(Components.ID(uuid),
                         this._registeredComponents[uuid].factory);
    Cm.QueryInterface(Ci.nsIComponentRegistrar)
      .registerFactory(this._registeredComponents[uuid].originalCID, "",
                       this._registeredComponents[uuid].contractID, null);

    delete this._registeredComponents[uuid];
  },

  unregisterAll: function() {
    for each (let id in this._registeredComponents)
      this.unregister(id);
  }
};
