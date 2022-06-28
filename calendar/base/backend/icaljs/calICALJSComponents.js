/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../src/calTimezone.js */
/* import-globals-from calDateTime.js */
/* import-globals-from calDuration.js */
/* import-globals-from calICSService.js */
/* import-globals-from calPeriod.js */
/* import-globals-from calRecurrenceRule.js */

var { ComponentUtils } = ChromeUtils.import("resource://gre/modules/ComponentUtils.jsm");
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

/**
 * @param {string} cid - Class ID as string.
 * @returns {function} Constructor to create the requested class ID component.
 */
this.getComponentConstructor = cid => {
  if (!this.loadedScripts) {
    let scriptLoadOrder = [
      "resource:///components/calTimezone.js",
      "resource:///components/calDateTime.js",
      "resource:///components/calDuration.js",
      "resource:///components/calICSService.js",
      "resource:///components/calPeriod.js",
      "resource:///components/calRecurrenceRule.js",
    ];

    for (let script of scriptLoadOrder) {
      Services.scriptloader.loadSubScript(script, this);
    }
    this.loadedScripts = true;
  }

  let components = [
    calDateTime,
    calDuration,
    calIcalComponent,
    calIcalProperty,
    calICSService,
    calPeriod,
    calRecurrenceRule,
  ];

  for (const component of components) {
    if (component.prototype.classID.toString() == cid) {
      return component;
    }
  }
  throw new Error("No component for cid " + cid);
};
