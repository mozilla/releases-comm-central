/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://calendar/modules/calUtils.jsm");
Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource://gre/modules/Preferences.jsm");

this.EXPORTED_SYMBOLS = ["cal"]; // even though it's defined in calUtils.jsm, import needs this

/**
 * Iterates an array of items, i.e. the passed item including all
 * overridden instances of a recurring series.
 *
 * @param items array of items
 */
cal.itemIterator = function* (items) {
    for (let item of items) {
        yield item;
        let rec = item.recurrenceInfo;
        if (rec) {
            for (let exid of rec.getExceptionIds({})) {
                yield rec.getExceptionFor(exid);
            }
        }
    }
};

/**
 * Runs the body() function once for each item in the iterator using the event
 * queue to make sure other actions could run inbetween. When all iterations are
 * done (and also when cal.forEach.BREAK is returned), calls the completed()
 * function if passed.
 *
 * If you would like to break or continue inside the body(), return either
 *     cal.forEach.BREAK or cal.forEach.CONTINUE
 *
 * Note since the event queue is used, this function will return immediately,
 * before the iteration is complete. If you need to run actions after the real
 * for each loop, use the optional completed() function.
 *
 * @param iter          The Iterator or the plain Object to go through in this
 *                      loop.
 * @param body          The function called for each iteration. Its parameter is
 *                          the single item from the iterator.
 * @param completed     [optional] The function called after the loop completes.
 */
cal.forEach = function(iterable, body, completed) {
    // This should be a const one day, lets keep it a pref for now though until we
    // find a sane value.
    let LATENCY = Preferences.get("calendar.threading.latency", 250);

    if (typeof iterable == "object" && !iterable[Symbol.iterator]) {
        iterable = Object.entries(iterable);
    }

    let ourIter = iterable[Symbol.iterator]();
    let currentThread = Services.tm.currentThread;

    // This is our dispatcher, it will be used for the iterations
    let dispatcher = {
        run: function() {
            let startTime = (new Date()).getTime();
            while (((new Date()).getTime() - startTime) < LATENCY) {
                let next = ourIter.next();
                let done = next.done;

                if (!done) {
                    let rc = body(next.value);
                    if (rc == cal.forEach.BREAK) {
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
        }
    };

    currentThread.dispatch(dispatcher, currentThread.DISPATCH_NORMAL);
};

cal.forEach.CONTINUE = 1;
cal.forEach.BREAK = 2;

/**
 * "ical" namespace. Used for all iterators (and possibly other functions) that
 * are related to libical.
 */
cal.ical = {
    /**
     *  Yields all subcomponents in all calendars in the passed component.
     *  - If the passed component is an XROOT (contains multiple calendars),
     *    then go through all VCALENDARs in it and get their subcomponents.
     *  - If the passed component is a VCALENDAR, iterate through its direct
     *    subcomponents.
     *  - Otherwise assume the passed component is the item itself and yield
     *    only the passed component.
     *
     * This iterator can only be used in a for..of block:
     *   for (let component of cal.ical.calendarComponentIterator(aComp)) { ... }
     *
     *  @param aComponent       The component to iterate given the above rules.
     *  @param aCompType        The type of item to iterate.
     *  @return                 The iterator that yields all items.
     */
    calendarComponentIterator: function* (aComponent, aCompType) {
        let compType = (aCompType || "ANY");
        if (aComponent && aComponent.componentType == "VCALENDAR") {
            yield* cal.ical.subcomponentIterator(aComponent, compType);
        } else if (aComponent && aComponent.componentType == "XROOT") {
            for (let calComp of cal.ical.subcomponentIterator(aComponent, "VCALENDAR")) {
                yield* cal.ical.subcomponentIterator(calComp, compType);
            }
        } else if (aComponent && (compType == "ANY" || compType == aComponent.componentType)) {
            yield aComponent;
        }
    },

    /**
     * Use to iterate through all subcomponents of a calIIcalComponent. This
     * iterators depth is 1, this means no sub-sub-components will be iterated.
     *
     * This iterator can only be used in a for() block:
     *   for (let component in cal.ical.subcomponentIterator(aComp)) { ... }
     *
     * @param aComponent        The component who's subcomponents to iterate.
     * @param aSubcomp          (optional) the specific subcomponent to
     *                            enumerate. If not given, "ANY" will be used.
     * @return                  An iterator object to iterate the properties.
     */
    subcomponentIterator: function* (aComponent, aSubcomp) {
        let subcompName = (aSubcomp || "ANY");
        for (let subcomp = aComponent.getFirstSubcomponent(subcompName);
             subcomp;
             subcomp = aComponent.getNextSubcomponent(subcompName)) {
            yield subcomp;
        }
    },

    /**
     * Use to iterate through all properties of a calIIcalComponent.
     * This iterator can only be used in a for() block:
     *   for (let property in cal.ical.propertyIterator(aComp)) { ... }
     *
     * @param aComponent        The component to iterate.
     * @param aProperty         (optional) the specific property to enumerate.
     *                            If not given, "ANY" will be used.
     * @return                  An iterator object to iterate the properties.
     */
    propertyIterator: function* (aComponent, aProperty) {
        let propertyName = (aProperty || "ANY");
        for (let prop = aComponent.getFirstProperty(propertyName);
             prop;
             prop = aComponent.getNextProperty(propertyName)) {
            yield prop;
        }
    },

    /**
     * Use to iterate through all parameters of a calIIcalProperty.
     * This iterator behaves similar to the object iterator. Possible uses:
     *   for (let paramName in cal.ical.paramIterator(prop)) { ... }
     * or:
     *   for (let [paramName, paramValue] of cal.ical.paramIterator(prop)) { ... }
     *
     * @param aProperty         The property to iterate.
     * @return                  An iterator object to iterate the properties.
     */
    paramIterator: function* (aProperty) {
        let paramSet = new Set();
        for (let paramName = aProperty.getFirstParameterName();
             paramName;
             paramName = aProperty.getNextParameterName()) {
            // Workaround to avoid infinite loop when the property
            // contains duplicate parameters (bug 875739 for libical)
            if (!paramSet.has(paramName)) {
                yield [paramName, aProperty.getParameter(paramName)];
                paramSet.add(paramName);
            }
        }
    }
};
