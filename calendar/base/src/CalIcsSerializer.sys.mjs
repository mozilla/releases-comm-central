/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { cal } from "resource:///modules/calendar/calUtils.sys.mjs";

export function CalIcsSerializer() {
  this.wrappedJSObject = this;
  this.mItems = [];
  this.mProperties = [];
  this.mComponents = [];
}

CalIcsSerializer.prototype = {
  QueryInterface: ChromeUtils.generateQI(["calIIcsSerializer"]),
  classID: Components.ID("{207a6682-8ff1-4203-9160-729ec28c8766}"),

  addItems(aItems) {
    if (aItems.length > 0) {
      this.mItems = this.mItems.concat(aItems);
    }
  },

  addProperty(aProperty) {
    this.mProperties.push(aProperty);
  },

  addComponent(aComponent) {
    this.mComponents.push(aComponent);
  },

  serializeToString() {
    const calComp = this.getIcalComponent();
    return calComp.serializeToICS();
  },

  serializeToInputStream(aStream) {
    const calComp = this.getIcalComponent();
    return calComp.serializeToICSStream();
  },

  serializeToStream(aStream) {
    const str = this.serializeToString();

    // Convert the javascript string to an array of bytes, using the
    // UTF8 encoder
    const convStream = Cc["@mozilla.org/intl/converter-output-stream;1"].createInstance(
      Ci.nsIConverterOutputStream
    );
    convStream.init(aStream, "UTF-8");

    convStream.writeString(str);
    convStream.close();
  },

  getIcalComponent() {
    const calComp = cal.icsService.createIcalComponent("VCALENDAR");
    cal.item.setStaticProps(calComp);

    // xxx todo: think about that the below code doesn't clone the properties/components,
    //           thus ownership is moved to returned VCALENDAR...

    for (const prop of this.mProperties) {
      calComp.addProperty(prop);
    }
    for (const comp of this.mComponents) {
      calComp.addSubcomponent(comp);
    }

    for (const item of cal.iterate.items(this.mItems)) {
      calComp.addSubcomponent(item.icalComponent);
    }

    return calComp;
  },
};
