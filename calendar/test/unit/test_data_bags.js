/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function run_test() {
    test_property_map();
    test_listener_set();
    test_observer_set();
    test_operation_group();
}

function test_property_map() {
    let data = {
        key1: "value1",
        key2: undefined,
        key3: "value2"
    };

    let map = new cal.data.PropertyMap(Object.entries(data));
    let keys = new Set(Object.keys(data));

    let enumerator = map.simpleEnumerator;

    while (enumerator.hasMoreElements()) {
        let next = enumerator.getNext();
        ok(keys.has(next.name));
        equal(data[next.name], next.value);

        keys.delete(next.name);

        // An extra hasMoreElements shouldn't disrupt the enumeration
        enumerator.hasMoreElements();
    }

    equal(keys.size, 1);
    ok(keys.has("key2"));

    throws(() => {
        enumerator.getNext();
    }, code => code == Components.results.NS_ERROR_UNEXPECTED);
}

function test_listener_set() {
    let set = new cal.data.ListenerSet(Components.interfaces.calIOperationListener);
    let listener1Id = null;
    let listener2Id = null;

    let listener1 = cal.createAdapter("calIOperationListener", {
        onOperationComplete: function(aCalendar, aStatus, aOpType, aId, aDetail) {
            listener1Id = aId;
        }
    });
    let listener2 = cal.createAdapter("calIOperationListener", {
        onOperationComplete: function(aCalendar, aStatus, aOpType, aId, aDetail) {
            listener2Id = aId;
        }
    });

    set.add(listener1);
    set.add(listener2);
    set.notify("onOperationComplete", [null, null, null, "test", null]);
    equal(listener1Id, "test");
    equal(listener2Id, "test");

    set.delete(listener2);
    listener1Id = listener2Id = null;
    set.notify("onOperationComplete", [null, null, null, "test2", null]);
    equal(listener1Id, "test2");
    strictEqual(listener2Id, null);

    // Re-adding the listener may lead to an endless loop if the notify
    // function uses a live list of observers.
    let called = 0;
    let listener3 = cal.createAdapter("calIOperationListener", {
        onOperationComplete: function(aCalendar, aStatus, aOpType, aId, aDetail) {
            set.delete(listener3);
            if (called == 0) {
                set.add(listener3);
            }
            called++;
        }
    });

    set.add(listener3);
    set.notify("onOperationComplete", [null, null, null, "test3", null]);
    equal(called, 1);
}

function test_observer_set() {
    let set = new cal.data.ObserverSet(Components.interfaces.calIObserver);
    let listenerCountBegin1 = 0;
    let listenerCountBegin2 = 0;
    let listenerCountEnd1 = 0;
    let listenerCountEnd2 = 0;

    let listener1 = cal.createAdapter("calIObserver", {
        onStartBatch: function() {
            listenerCountBegin1++;
        },
        onEndBatch: function() {
            listenerCountEnd1++;
        }
    });
    let listener2 = cal.createAdapter("calIObserver", {
        onStartBatch: function() {
            listenerCountBegin2++;
        },
        onEndBatch: function() {
            listenerCountEnd2++;
        }
    });

    set.add(listener1);
    equal(listenerCountBegin1, 0);
    equal(listenerCountEnd1, 0);
    equal(set.batchCount, 0);

    set.notify("onStartBatch");
    equal(listenerCountBegin1, 1);
    equal(listenerCountEnd1, 0);
    equal(set.batchCount, 1);

    set.add(listener2);
    equal(listenerCountBegin1, 1);
    equal(listenerCountEnd1, 0);
    equal(listenerCountBegin2, 1);
    equal(listenerCountEnd2, 0);
    equal(set.batchCount, 1);

    set.add(listener1);
    equal(listenerCountBegin1, 1);
    equal(listenerCountEnd1, 0);
    equal(listenerCountBegin2, 1);
    equal(listenerCountEnd2, 0);
    equal(set.batchCount, 1);

    set.notify("onEndBatch");
    equal(listenerCountBegin1, 1);
    equal(listenerCountEnd1, 1);
    equal(listenerCountBegin2, 1);
    equal(listenerCountEnd2, 1);
    equal(set.batchCount, 0);
}

function test_operation_group() {
    let calledCancel = false;
    let calledOperationCancel = null;
    let group = new cal.data.OperationGroup();
    ok(group.id.endsWith("-0"));
    ok(group.isPending);
    equal(group.status, Components.results.NS_OK);
    ok(group.isEmpty);

    let operation = {
        id: 123,
        isPending: true,
        cancel: (status) => {
            calledOperationCancel = status;
        }
    };

    group.add(operation);
    ok(!group.isEmpty);

    group.notifyCompleted(Components.results.NS_ERROR_FAILURE);
    ok(!group.isPending);
    equal(group.status, Components.results.NS_ERROR_FAILURE);
    strictEqual(calledOperationCancel, null);

    group.remove(operation);
    ok(group.isEmpty);

    group = new cal.data.OperationGroup(() => {
        calledCancel = true;
    });
    ok(group.id.endsWith("-1"));
    group.add(operation);

    group.cancel();
    equal(group.status, Components.interfaces.calIErrors.OPERATION_CANCELLED);
    equal(calledOperationCancel, Components.interfaces.calIErrors.OPERATION_CANCELLED);
    ok(calledCancel);
}
