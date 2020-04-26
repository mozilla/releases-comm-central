/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

ChromeUtils.defineModuleGetter(this, "cal", "resource:///modules/calendar/calUtils.jsm");

/*
 * Iterators for various data structures
 */

// NOTE: This module should not be loaded directly, it is available when
// including calUtils.jsm under the cal.iterate namespace.

const EXPORTED_SYMBOLS = ["caliterate"]; /* exported caliterate */

var caliterate = {
  /**
   * Iterates an array of items, i.e. the passed item including all
   * overridden instances of a recurring series.
   *
   * @param {calIItemBase[]} items        array of items to iterate
   * @yields {calIItemBase}
   */
  *items(items) {
    for (let item of items) {
      yield item;
      let rec = item.recurrenceInfo;
      if (rec) {
        for (let exid of rec.getExceptionIds()) {
          yield rec.getExceptionFor(exid);
        }
      }
    }
  },

  /**
   * Runs the body() function once for each item in the iterator using the event queue to make
   * sure other actions could run in between. When all iterations are done (and also when
   * cal.iterate.forEach.BREAK is returned), calls the completed() function if passed.
   *
   * If you would like to break or continue inside the body(), return either
   * cal.iterate.forEach.BREAK or cal.iterate.forEach.CONTINUE
   *
   * Note since the event queue is used, this function will return immediately, before the
   * iteration is complete. If you need to run actions after the real for each loop, use the
   * optional completed() function.
   *
   * @param {Iterable} iterable       The Iterator or the plain Object to go through in this loop.
   * @param {Function} body           The function called for each iteration. Its parameter is the
   *                                    single item from the iterator.
   * @param {?Function} completed     [optional] The function called after the loop completes.
   */
  forEach: (() => {
    // eslint-disable-next-line require-jsdoc
    function forEach(iterable, body, completed = null) {
      // This should be a const one day, lets keep it a pref for now though until we
      // find a sane value.
      let LATENCY = Services.prefs.getIntPref("calendar.threading.latency", 250);

      if (typeof iterable == "object" && !iterable[Symbol.iterator]) {
        iterable = Object.entries(iterable);
      }

      let ourIter = iterable[Symbol.iterator]();
      let currentThread = Services.tm.currentThread;

      // This is our dispatcher, it will be used for the iterations
      let dispatcher = {
        run() {
          let startTime = new Date().getTime();
          while (new Date().getTime() - startTime < LATENCY) {
            let next = ourIter.next();
            let done = next.done;

            if (!done) {
              let rc = body(next.value);
              if (rc == cal.iterate.forEach.BREAK) {
                done = true;
              }
            }

            if (done) {
              if (completed) {
                completed();
              }
              return;
            }
          }

          currentThread.dispatch(this, currentThread.DISPATCH_NORMAL);
        },
      };

      currentThread.dispatch(dispatcher, currentThread.DISPATCH_NORMAL);
    }
    forEach.CONTINUE = 1;
    forEach.BREAK = 2;

    return forEach;
  })(),

  /**
   *  Yields all subcomponents in all calendars in the passed component.
   *  - If the passed component is an XROOT (contains multiple calendars), then go through all
   *    VCALENDARs in it and get their subcomponents.
   *  - If the passed component is a VCALENDAR, iterate through its direct subcomponents.
   *  - Otherwise assume the passed component is the item itself and yield only the passed
   *    component.
   *
   * This iterator can only be used in a for..of block:
   *   for (let component of cal.iterate.icalComponent(aComp)) { ... }
   *
   *  @param {calIIcalComponent} aComponent   The component to iterate given the above rules.
   *  @param {String} aCompType               The type of item to iterate.
   *  @yields {calIIcalComponent}             The iterator that yields all items.
   */
  *icalComponent(aComponent, aCompType = "ANY") {
    if (aComponent && aComponent.componentType == "VCALENDAR") {
      yield* cal.iterate.icalSubcomponent(aComponent, aCompType);
    } else if (aComponent && aComponent.componentType == "XROOT") {
      for (let calComp of cal.iterate.icalSubcomponent(aComponent, "VCALENDAR")) {
        yield* cal.iterate.icalSubcomponent(calComp, aCompType);
      }
    } else if (aComponent && (aCompType == "ANY" || aCompType == aComponent.componentType)) {
      yield aComponent;
    }
  },

  /**
   * Use to iterate through all subcomponents of a calIIcalComponent. This iterators depth is 1,
   * this means no sub-sub-components will be iterated.
   *
   * This iterator can only be used in a for() block:
   *   for (let component of cal.iterate.icalSubcomponent(aComp)) { ... }
   *
   * @param {calIIcalComponent} aComponent    The component who's subcomponents to iterate.
   * @param {?String} aSubcomp                (optional) the specific subcomponent to enumerate.
   *                                            If not given, "ANY" will be used.
   * @yields {calIIcalComponent}              An iterator object to iterate the properties.
   */
  *icalSubcomponent(aComponent, aSubcomp = "ANY") {
    for (
      let subcomp = aComponent.getFirstSubcomponent(aSubcomp);
      subcomp;
      subcomp = aComponent.getNextSubcomponent(aSubcomp)
    ) {
      yield subcomp;
    }
  },

  /**
   * Use to iterate through all properties of a calIIcalComponent.
   * This iterator can only be used in a for() block:
   *   for (let property of cal.iterate.icalProperty(aComp)) { ... }
   *
   * @param {calIIcalComponent} aComponent    The component to iterate.
   * @param {?String} aProperty               (optional) the specific property to enumerate.
   *                                            If not given, "ANY" will be used.
   * @yields {calIIcalProperty}               An iterator object to iterate the properties.
   */
  *icalProperty(aComponent, aProperty = "ANY") {
    for (
      let prop = aComponent.getFirstProperty(aProperty);
      prop;
      prop = aComponent.getNextProperty(aProperty)
    ) {
      yield prop;
    }
  },

  /**
   * Use to iterate through all parameters of a calIIcalProperty.
   * This iterator behaves similar to the object iterator. Possible uses:
   *   for (let paramName in cal.iterate.icalParameter(prop)) { ... }
   * or:
   *   for (let [paramName, paramValue] of cal.iterate.icalParameter(prop)) { ... }
   *
   * @param {calIIcalProperty} aProperty         The property to iterate.
   * @yields {[String, String]}                  An iterator object to iterate the properties.
   */
  *icalParameter(aProperty) {
    let paramSet = new Set();
    for (
      let paramName = aProperty.getFirstParameterName();
      paramName;
      paramName = aProperty.getNextParameterName()
    ) {
      // Workaround to avoid infinite loop when the property
      // contains duplicate parameters (bug 875739 for libical)
      if (!paramSet.has(paramName)) {
        yield [paramName, aProperty.getParameter(paramName)];
        paramSet.add(paramName);
      }
    }
  },
};
