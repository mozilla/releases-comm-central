/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function run_test() {
  test_listener_set();
  test_observer_set();
  test_operation_group();
}

function test_listener_set() {
  const set = new cal.data.ListenerSet(Ci.calIOperationListener);
  let listener1Id = null;
  let listener2Id = null;

  const listener1 = cal.createAdapter("calIOperationListener", {
    onOperationComplete(aCalendar, aStatus, aOpType, aId) {
      listener1Id = aId;
    },
  });
  const listener2 = cal.createAdapter("calIOperationListener", {
    onOperationComplete(aCalendar, aStatus, aOpType, aId) {
      listener2Id = aId;
    },
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
  const listener3 = cal.createAdapter("calIOperationListener", {
    onOperationComplete() {
      set.delete(listener3);
      if (called == 0) {
        set.add(listener3);
      }
      called++;
    },
  });

  set.add(listener3);
  set.notify("onOperationComplete", [null, null, null, "test3", null]);
  equal(called, 1);
}

function test_observer_set() {
  const set = new cal.data.ObserverSet(Ci.calIObserver);
  let listenerCountBegin1 = 0;
  let listenerCountBegin2 = 0;
  let listenerCountEnd1 = 0;
  let listenerCountEnd2 = 0;

  const listener1 = cal.createAdapter("calIObserver", {
    onStartBatch() {
      listenerCountBegin1++;
    },
    onEndBatch() {
      listenerCountEnd1++;
    },
  });
  const listener2 = cal.createAdapter("calIObserver", {
    onStartBatch() {
      listenerCountBegin2++;
    },
    onEndBatch() {
      listenerCountEnd2++;
    },
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
  equal(group.status, Cr.NS_OK);
  ok(group.isEmpty);

  const operation = {
    id: 123,
    isPending: true,
    cancel: status => {
      calledOperationCancel = status;
    },
  };

  group.add(operation);
  ok(!group.isEmpty);

  group.notifyCompleted(Cr.NS_ERROR_FAILURE);
  ok(!group.isPending);
  equal(group.status, Cr.NS_ERROR_FAILURE);
  strictEqual(calledOperationCancel, null);

  group.remove(operation);
  ok(group.isEmpty);

  group = new cal.data.OperationGroup(() => {
    calledCancel = true;
  });
  ok(group.id.endsWith("-1"));
  group.add(operation);

  group.cancel();
  equal(group.status, Ci.calIErrors.OPERATION_CANCELLED);
  equal(calledOperationCancel, Ci.calIErrors.OPERATION_CANCELLED);
  ok(calledCancel);
}
