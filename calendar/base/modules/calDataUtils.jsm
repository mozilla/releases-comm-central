/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "cal", "resource://calendar/modules/calUtils.jsm", "cal");

this.EXPORTED_SYMBOLS = ["caldata"]; /* exported caldata */

class PropertyMap extends Map {
    get simpleEnumerator() {
        let iter = this.entries();
        return {
            current: null,

            QueryInterface: XPCOMUtils.generateQI([Components.interfaces.nsISimpleEnumerator]),

            hasMoreElements: function() {
                this.current = iter.next();
                return !this.current.done;
            },

            getNext: function() {
                if (!this.current || this.current.done) {
                    throw Components.results.NS_ERROR_UNEXPECTED;
                }
                return {
                    QueryInterface: XPCOMUtils.generateQI([Components.interfaces.nsIProperty]),
                    name: this.current.value[0],
                    value: this.current.value[1]
                };
            }
        };
    }
}

class ListenerSet extends Set {
    constructor(iid, iterable) {
        super(iterable);
        this.mIID = iid;
    }

    add(item) {
        super.add(item.QueryInterface(this.mIID));
    }

    delete(item) {
        super.delete(item.QueryInterface(this.mIID));
    }

    notify(func, args=[]) {
        for (let observer of this.values()) {
            try {
                observer[func](...args);
            } catch (exc) {
                let stack = exc.stack || (exc.location ? exc.location.formattedStack : null);
                Components.utils.reportError(exc + "\nSTACK: " + stack);
            }
        }
    }
}

class ObserverSet extends ListenerSet {
    constructor(iid, iterable) {
        super(iid, iterable);
        this.mBatchCount = 0;
    }

    notify(func, args=[]) {
        switch (func) {
            case "onStartBatch":
                ++this.mBatchCount;
                break;
            case "onEndBatch":
                --this.mBatchCount;
                break;
        }
        return super.notify(func, args);
    }

    add(item) {
        if (this.has(item)) {
            // Replay batch notifications, because the onEndBatch notifications are yet to come.
            // We may think about doing the reverse on remove, though I currently see no need:
            for (let i = this.mBatchCount; i; i--) {
                item.onStartBatch();
            }
        }
        super.add(item);
    }
}

var caldata = {
    ListenerSet: ListenerSet,
    ObserverSet: ObserverSet,
    PropertyMap: PropertyMap
};
