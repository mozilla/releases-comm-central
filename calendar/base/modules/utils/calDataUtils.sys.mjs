/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Data structures and algorithms used within the codebase
 */

// NOTE: This module should not be loaded directly, it is available when
// including calUtils.sys.mjs under the cal.data namespace.

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  cal: "resource:///modules/calendar/calUtils.sys.mjs",
});

class ListenerSet extends Set {
  constructor(iid, iterable) {
    super(iterable);
    this.mIID = iid;
  }

  add(item) {
    super.add(item.QueryInterface(this.mIID));
  }

  has(item) {
    return super.has(item.QueryInterface(this.mIID));
  }

  delete(item) {
    super.delete(item.QueryInterface(this.mIID));
  }

  notify(func, args = []) {
    const currentObservers = [...this.values()];
    for (const observer of currentObservers) {
      try {
        observer[func](...args);
      } catch (ex) {
        console.error(ex);
      }
    }
  }
}

class ObserverSet extends ListenerSet {
  constructor(iid, iterable) {
    super(iid, iterable);
    this.mCalendarsInBatch = new Set();
  }

  get batchCount() {
    return this.mCalendarsInBatch.size;
  }

  notify(func, args = []) {
    switch (func) {
      case "onStartBatch":
        this.mCalendarsInBatch.add(args[0]);
        break;
      case "onEndBatch":
        this.mCalendarsInBatch.delete(args[0]);
        break;
    }
    return super.notify(func, args);
  }

  add(item) {
    if (!this.has(item)) {
      // Replay batch notifications, because the onEndBatch notifications are yet to come.
      // We may think about doing the reverse on remove, though I currently see no need:
      for (const calendar of this.mCalendarsInBatch) {
        item.onStartBatch(calendar);
      }
    }
    super.add(item);
  }
}

/**
 * This object implements calIOperation and could group multiple sub
 * operations into one. You can pass a cancel function which is called once
 * the operation group is cancelled.
 * Users must call notifyCompleted() once all sub operations have been
 * successful, else the operation group will stay pending.
 * The reason for the latter is that providers currently should (but need
 * not) implement (and return) calIOperation handles, thus there may be pending
 * calendar operations (without handle).
 */
class OperationGroup {
  static nextGroupId() {
    if (typeof OperationGroup.mOpGroupId == "undefined") {
      OperationGroup.mOpGroupId = 0;
    }

    return OperationGroup.mOpGroupId++;
  }

  constructor(aCancelFunc) {
    this.mId = lazy.cal.getUUID() + "-" + OperationGroup.nextGroupId();
    this.mIsPending = true;

    this.mCancelFunc = aCancelFunc;
    this.mSubOperations = [];
    this.mStatus = Cr.NS_OK;
  }

  get id() {
    return this.mId;
  }
  get isPending() {
    return this.mIsPending;
  }
  get status() {
    return this.mStatus;
  }
  get isEmpty() {
    return this.mSubOperations.length == 0;
  }

  add(aOperation) {
    if (aOperation && aOperation.isPending) {
      this.mSubOperations.push(aOperation);
    }
  }

  remove(aOperation) {
    if (aOperation) {
      this.mSubOperations = this.mSubOperations.filter(operation => aOperation.id != operation.id);
    }
  }

  notifyCompleted(aStatus) {
    lazy.cal.ASSERT(this.isPending, "[OperationGroup_notifyCompleted] this.isPending");
    if (this.isPending) {
      this.mIsPending = false;
      if (aStatus) {
        this.mStatus = aStatus;
      }
    }
  }

  cancel(aStatus = Ci.calIErrors.OPERATION_CANCELLED) {
    if (this.isPending) {
      this.notifyCompleted(aStatus);
      const cancelFunc = this.mCancelFunc;
      if (cancelFunc) {
        this.mCancelFunc = null;
        cancelFunc();
      }
      const subOperations = this.mSubOperations;
      this.mSubOperations = [];
      for (const operation of subOperations) {
        operation.cancel(Ci.calIErrors.OPERATION_CANCELLED);
      }
    }
  }

  toString() {
    return `[OperationGroup id=${this.id}]`;
  }
}

export var data = {
  ListenerSet,
  ObserverSet,
  OperationGroup,

  /**
   * Use the binary search algorithm to search for an item in an array.
   * function.
   *
   * The comptor function may look as follows for calIDateTime objects.
   *     function comptor(a, b) {
   *         return a.compare(b);
   *     }
   * If no comptor is specified, the default greater-than comptor will be used.
   *
   * @param itemArray             The array to search.
   * @param newItem               The item to search in the array.
   * @param comptor               A comparison function that can compare two items.
   * @returns The index of the new item.
   */
  binarySearch(itemArray, newItem, comptor) {
    function binarySearchInternal(low, high) {
      // Are we done yet?
      if (low == high) {
        return low + (comptor(newItem, itemArray[low]) < 0 ? 0 : 1);
      }

      const mid = Math.floor(low + (high - low) / 2);
      const cmp = comptor(newItem, itemArray[mid]);
      if (cmp > 0) {
        return binarySearchInternal(mid + 1, high);
      } else if (cmp < 0) {
        return binarySearchInternal(low, mid);
      }
      return mid;
    }

    if (itemArray.length < 1) {
      return -1;
    }
    if (!comptor) {
      comptor = function (a, b) {
        return (a > b) - (a < b);
      };
    }
    return binarySearchInternal(0, itemArray.length - 1);
  },

  /**
   * Insert a new node underneath the given parentNode, using binary search. See binarySearch
   * for a note on how the comptor works.
   *
   * @param parentNode           The parent node underneath the new node should be inserted.
   * @param inserNode            The node to insert
   * @param aItem                The calendar item to add a widget for.
   * @param comptor              A comparison function that can compare two items (not DOM Nodes!)
   * @param discardDuplicates    Use the comptor function to check if the item in
   *                               question is already in the array. If so, the
   *                               new item is not inserted.
   * @param itemAccessor         [optional] A function that receives a DOM node and returns the associated item
   *                               If null, this function will be used: function(n) n.item
   */
  binaryInsertNode(parentNode, insertNode, aItem, comptor, discardDuplicates, itemAccessor) {
    const accessor = itemAccessor || data.binaryInsertNodeDefaultAccessor;

    // Get the index of the node before which the inserNode will be inserted
    let newIndex = data.binarySearch(Array.from(parentNode.children, accessor), aItem, comptor);

    if (newIndex < 0) {
      parentNode.appendChild(insertNode);
      newIndex = 0;
    } else if (
      !discardDuplicates ||
      comptor(
        accessor(parentNode.children[Math.min(newIndex, parentNode.children.length - 1)]),
        aItem
      ) >= 0
    ) {
      // Only add the node if duplicates should not be discarded, or if
      // they should and the childNode[newIndex] == node.
      const node = parentNode.children[newIndex];
      parentNode.insertBefore(insertNode, node);
    }
    return newIndex;
  },
  binaryInsertNodeDefaultAccessor: n => n.item,

  /**
   * Insert an item into the given array, using binary search. See binarySearch
   * for a note on how the comptor works.
   *
   * @param itemArray             The array to insert into.
   * @param item                  The item to insert into the array.
   * @param comptor               A comparison function that can compare two items.
   * @param discardDuplicates     Use the comptor function to check if the item in
   *                                question is already in the array. If so, the
   *                                new item is not inserted.
   * @returns The index of the new item.
   */
  binaryInsert(itemArray, item, comptor, discardDuplicates) {
    let newIndex = data.binarySearch(itemArray, item, comptor);

    if (newIndex < 0) {
      itemArray.push(item);
      newIndex = 0;
    } else if (
      !discardDuplicates ||
      comptor(itemArray[Math.min(newIndex, itemArray.length - 1)], item) != 0
    ) {
      // Only add the item if duplicates should not be discarded, or if
      // they should and itemArray[newIndex] != item.
      itemArray.splice(newIndex, 0, item);
    }
    return newIndex;
  },

  /**
   * Generic object comparer
   * Use to compare two objects which are not of type calIItemBase, in order
   * to avoid the js-wrapping issues mentioned above.
   *
   * @param aObject        first object to be compared
   * @param aOtherObject   second object to be compared
   * @param aIID           IID to use in comparison, undefined/null defaults to nsISupports
   */
  compareObjects(aObject, aOtherObject, aIID) {
    // xxx todo: seems to work fine, but I still mistrust this trickery...
    //           Anybody knows an official API that could be used for this purpose?
    //           For what reason do clients need to pass aIID since
    //           every XPCOM object has to implement nsISupports?
    //           XPCOM (like COM, like UNO, ...) defines that QueryInterface *only* needs to return
    //           the very same pointer for nsISupports during its lifetime.
    if (!aIID) {
      aIID = Ci.nsISupports;
    }
    const sip1 = Cc["@mozilla.org/supports-interface-pointer;1"].createInstance(
      Ci.nsISupportsInterfacePointer
    );
    sip1.data = aObject;
    sip1.dataIID = aIID;

    const sip2 = Cc["@mozilla.org/supports-interface-pointer;1"].createInstance(
      Ci.nsISupportsInterfacePointer
    );
    sip2.data = aOtherObject;
    sip2.dataIID = aIID;
    return sip1.data == sip2.data;
  },
};
