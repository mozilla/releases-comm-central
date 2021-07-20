/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported makeMemberAttr, makeMemberAttrProperty */

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
var { CalAttendee } = ChromeUtils.import("resource:///modules/CalAttendee.jsm");
var { CalRelation } = ChromeUtils.import("resource:///modules/CalRelation.jsm");
var { CalAttachment } = ChromeUtils.import("resource:///modules/CalAttachment.jsm");
var { XPCOMUtils } = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetters(this, {
  CalAlarm: "resource:///modules/CalAlarm.jsm",
  CalRecurrenceInfo: "resource:///modules/CalRecurrenceInfo.jsm",
});

XPCOMUtils.defineLazyServiceGetter(
  this,
  "gParserUtils",
  "@mozilla.org/parserutils;1",
  "nsIParserUtils"
);

XPCOMUtils.defineLazyServiceGetter(
  this,
  "gTextToHtmlConverter",
  "@mozilla.org/txttohtmlconv;1",
  "mozITXTToHTMLConv"
);

/**
 * calItemBase prototype definition
 *
 * @implements calIItemBase
 * @constructor
 */
function calItemBase() {
  cal.ASSERT(false, "Inheriting objects call initItemBase()!");
}

calItemBase.prototype = {
  mProperties: null,
  mPropertyParams: null,

  mIsProxy: false,
  mHashId: null,
  mImmutable: false,
  mDirty: false,
  mCalendar: null,
  mParentItem: null,
  mRecurrenceInfo: null,
  mOrganizer: null,

  mAlarms: null,
  mAlarmLastAck: null,

  mAttendees: null,
  mAttachments: null,
  mRelations: null,
  mCategories: null,

  mACLEntry: null,

  /**
   * Initialize the base item's attributes. Can be called from inheriting
   * objects in their constructor.
   */
  initItemBase() {
    this.wrappedJSObject = this;
    this.mProperties = new Map();
    this.mPropertyParams = {};
    this.setProperty("CREATED", cal.dtz.jsDateToDateTime(new Date()));
  },

  /**
   * @see nsISupports
   */
  QueryInterface: ChromeUtils.generateQI(["calIItemBase"]),

  /**
   * @see calIItemBase
   */
  get aclEntry() {
    let aclEntry = this.mACLEntry;
    let aclManager = this.calendar && this.calendar.superCalendar.aclManager;

    if (!aclEntry && aclManager) {
      this.mACLEntry = aclManager.getItemEntry(this);
      aclEntry = this.mACLEntry;
    }

    if (!aclEntry && this.parentItem != this) {
      // No ACL entry on this item, check the parent
      aclEntry = this.parentItem.aclEntry;
    }

    return aclEntry;
  },

  // readonly attribute AUTF8String hashId;
  get hashId() {
    if (this.mHashId === null) {
      let rid = this.recurrenceId;
      let calendar = this.calendar;
      // some unused delim character:
      this.mHashId = [
        encodeURIComponent(this.id),
        rid ? rid.getInTimezone(cal.dtz.UTC).icalString : "",
        calendar ? encodeURIComponent(calendar.id) : "",
      ].join("#");
    }
    return this.mHashId;
  },

  // attribute AUTF8String id;
  get id() {
    return this.getProperty("UID");
  },
  set id(uid) {
    this.mHashId = null; // recompute hashId
    this.setProperty("UID", uid);
    if (this.mRecurrenceInfo) {
      this.mRecurrenceInfo.onIdChange(uid);
    }
  },

  // attribute calIDateTime recurrenceId;
  get recurrenceId() {
    return this.getProperty("RECURRENCE-ID");
  },
  set recurrenceId(rid) {
    this.mHashId = null; // recompute hashId
    this.setProperty("RECURRENCE-ID", rid);
  },

  // attribute calIRecurrenceInfo recurrenceInfo;
  get recurrenceInfo() {
    return this.mRecurrenceInfo;
  },
  set recurrenceInfo(value) {
    this.modify();
    this.mRecurrenceInfo = cal.unwrapInstance(value);
  },

  // attribute calIItemBase parentItem;
  get parentItem() {
    return this.mParentItem || this;
  },
  set parentItem(value) {
    if (this.mImmutable) {
      throw Components.Exception("", Cr.NS_ERROR_OBJECT_IS_IMMUTABLE);
    }
    this.mParentItem = cal.unwrapInstance(value);
  },

  /**
   * Initializes the base item to be an item proxy. Used by inheriting
   * objects createProxy() method.
   *
   * XXXdbo Explain proxy a bit better, either here or in
   * calIInternalShallowCopy.
   *
   * @see calIInternalShallowCopy
   * @param aParentItem     The parent item to initialize the proxy on.
   * @param aRecurrenceId   The recurrence id to initialize the proxy for.
   */
  initializeProxy(aParentItem, aRecurrenceId) {
    this.mIsProxy = true;

    aParentItem = cal.unwrapInstance(aParentItem);
    this.mParentItem = aParentItem;
    this.mCalendar = aParentItem.mCalendar;
    this.recurrenceId = aRecurrenceId;

    // Make sure organizer is unset, as the getter checks for this.
    this.mOrganizer = undefined;

    this.mImmutable = aParentItem.mImmutable;
  },

  // readonly attribute boolean isMutable;
  get isMutable() {
    return !this.mImmutable;
  },

  /**
   * This function should be called by all members that modify the item. It
   * checks if the item is immutable and throws accordingly, and sets the
   * mDirty property.
   */
  modify() {
    if (this.mImmutable) {
      throw Components.Exception("", Cr.NS_ERROR_OBJECT_IS_IMMUTABLE);
    }
    this.mDirty = true;
  },

  /**
   * Makes sure the item is not dirty. If the item is dirty, properties like
   * LAST-MODIFIED and DTSTAMP are set to now.
   */
  ensureNotDirty() {
    if (this.mDirty) {
      let now = cal.dtz.jsDateToDateTime(new Date());
      this.setProperty("LAST-MODIFIED", now);
      this.setProperty("DTSTAMP", now);
      this.mDirty = false;
    }
  },

  /**
   * Makes all properties of the base item immutable. Can be called by
   * inheriting objects' makeImmutable method.
   */
  makeItemBaseImmutable() {
    if (this.mImmutable) {
      return;
    }

    // make all our components immutable
    if (this.mRecurrenceInfo) {
      this.mRecurrenceInfo.makeImmutable();
    }

    if (this.mOrganizer) {
      this.mOrganizer.makeImmutable();
    }
    if (this.mAttendees) {
      for (let att of this.mAttendees) {
        att.makeImmutable();
      }
    }

    for (let propValue of this.mProperties.values()) {
      if (propValue instanceof Ci.calIDateTime && propValue.isMutable) {
        propValue.makeImmutable();
      }
    }

    if (this.mAlarms) {
      for (let alarm of this.mAlarms) {
        alarm.makeImmutable();
      }
    }

    if (this.mAlarmLastAck) {
      this.mAlarmLastAck.makeImmutable();
    }

    this.ensureNotDirty();
    this.mImmutable = true;
  },

  // boolean hasSameIds(in calIItemBase aItem);
  hasSameIds(that) {
    return (
      that &&
      this.id == that.id &&
      (this.recurrenceId == that.recurrenceId || // both null
        (this.recurrenceId &&
          that.recurrenceId &&
          this.recurrenceId.compare(that.recurrenceId) == 0))
    );
  },

  /**
   * Overridden by CalEvent to indicate the item is an event.
   */
  isEvent() {
    return false;
  },

  /**
   * Overridden by CalTodo to indicate the item is a todo.
   */
  isTodo() {
    return false;
  },

  // calIItemBase clone();
  clone() {
    return this.cloneShallow(this.mParentItem);
  },

  /**
   * Clones the base item's properties into the passed object, potentially
   * setting a new parent item.
   *
   * @param m     The item to clone this item into
   * @param aNewParent    (optional) The new parent item to set on m.
   */
  cloneItemBaseInto(cloned, aNewParent) {
    cloned.mImmutable = false;
    cloned.mACLEntry = this.mACLEntry;
    cloned.mIsProxy = this.mIsProxy;
    cloned.mParentItem = cal.unwrapInstance(aNewParent) || this.mParentItem;
    cloned.mHashId = this.mHashId;
    cloned.mCalendar = this.mCalendar;
    if (this.mRecurrenceInfo) {
      cloned.mRecurrenceInfo = cal.unwrapInstance(this.mRecurrenceInfo.clone());
      cloned.mRecurrenceInfo.item = cloned;
    }

    let org = this.organizer;
    if (org) {
      org = org.clone();
    }
    cloned.mOrganizer = org;

    cloned.mAttendees = [];
    for (let att of this.getAttendees()) {
      cloned.mAttendees.push(att.clone());
    }

    cloned.mProperties = new Map();
    for (let [name, value] of this.mProperties.entries()) {
      if (value instanceof Ci.calIDateTime) {
        value = value.clone();
      }

      cloned.mProperties.set(name, value);

      let propBucket = this.mPropertyParams[name];
      if (propBucket) {
        let newBucket = {};
        for (let param in propBucket) {
          newBucket[param] = propBucket[param];
        }
        cloned.mPropertyParams[name] = newBucket;
      }
    }

    cloned.mAttachments = [];
    for (let att of this.getAttachments()) {
      cloned.mAttachments.push(att.clone());
    }

    cloned.mRelations = [];
    for (let rel of this.getRelations()) {
      cloned.mRelations.push(rel.clone());
    }

    cloned.mCategories = this.getCategories();

    cloned.mAlarms = [];
    for (let alarm of this.getAlarms()) {
      // Clone alarms into new item, assume the alarms from the old item
      // are valid and don't need validation.
      cloned.mAlarms.push(alarm.clone());
    }

    let alarmLastAck = this.alarmLastAck;
    if (alarmLastAck) {
      alarmLastAck = alarmLastAck.clone();
    }
    cloned.mAlarmLastAck = alarmLastAck;

    cloned.mDirty = this.mDirty;

    return cloned;
  },

  // attribute calIDateTime alarmLastAck;
  get alarmLastAck() {
    return this.mAlarmLastAck;
  },
  set alarmLastAck(aValue) {
    this.modify();
    if (aValue && !aValue.timezone.isUTC) {
      aValue = aValue.getInTimezone(cal.dtz.UTC);
    }
    this.mAlarmLastAck = aValue;
  },

  // readonly attribute calIDateTime lastModifiedTime;
  get lastModifiedTime() {
    this.ensureNotDirty();
    return this.getProperty("LAST-MODIFIED");
  },

  // readonly attribute calIDateTime stampTime;
  get stampTime() {
    this.ensureNotDirty();
    return this.getProperty("DTSTAMP");
  },

  // attribute AUTF8string descriptionText;
  get descriptionText() {
    return this.getProperty("DESCRIPTION");
  },

  set descriptionText(text) {
    this.setProperty("DESCRIPTION", text);
    if (text) {
      this.setPropertyParameter("DESCRIPTION", "ALTREP", null);
    } // else: property parameter deleted by setProperty(..., null)
  },

  // attribute AUTF8string descriptionHTML;
  get descriptionHTML() {
    let altrep = this.getPropertyParameter("DESCRIPTION", "ALTREP");
    if (altrep?.startsWith("data:text/html,")) {
      try {
        return decodeURIComponent(altrep.slice("data:text/html,".length));
      } catch (ex) {
        console.error(ex);
      }
    }
    // Fallback: Upconvert the plaintext
    let description = this.getProperty("DESCRIPTION");
    if (!description) {
      return null;
    }
    let mode = Ci.mozITXTToHTMLConv.kStructPhrase | Ci.mozITXTToHTMLConv.kURLs;
    description = gTextToHtmlConverter.scanTXT(description, mode);
    return description.replace(/\r?\n/g, "<br>");
  },

  set descriptionHTML(html) {
    if (html) {
      // Using the same mode as the HTML description editor
      // in calendar-item-iframe.js
      let mode =
        Ci.nsIDocumentEncoder.OutputDropInvisibleBreak |
        Ci.nsIDocumentEncoder.OutputWrap |
        Ci.nsIDocumentEncoder.OutputLFLineBreak |
        Ci.nsIDocumentEncoder.OutputNoScriptContent |
        Ci.nsIDocumentEncoder.OutputNoFramesContent |
        Ci.nsIDocumentEncoder.OutputBodyOnly;
      let text = gParserUtils.convertToPlainText(html, mode, 80);
      this.setProperty("DESCRIPTION", text);
      if (text) {
        this.setPropertyParameter(
          "DESCRIPTION",
          "ALTREP",
          "data:text/html," + encodeURIComponent(html)
        );
      } // else: can't set a property parameter if the property is empty
    } else {
      this.deleteProperty("DESCRIPTION");
    }
  },

  // readonly attribute nsIJSEnumerator properties;
  get properties() {
    let properties = this.mProperties;
    if (this.mIsProxy) {
      let parentProperties = this.mParentItem.wrappedJSObject.mProperties;
      let thisProperties = this.mProperties;
      properties = new Map(
        (function*() {
          yield* parentProperties;
          yield* thisProperties;
        })()
      );
    }

    return properties.entries();
  },

  // nsIVariant getProperty(in AString name);
  getProperty(aName) {
    let name = aName.toUpperCase();
    if (this.mProperties.has(name)) {
      return this.mProperties.get(name);
    }
    return this.mIsProxy ? this.mParentItem.getProperty(name) : null;
  },

  // boolean hasProperty(in AString name);
  hasProperty(aName) {
    return this.getProperty(aName.toUpperCase()) != null;
  },

  // void setProperty(in AString name, in nsIVariant value);
  setProperty(aName, aValue) {
    this.modify();
    aName = aName.toUpperCase();
    if (aValue || !isNaN(parseInt(aValue, 10))) {
      this.mProperties.set(aName, aValue);
      if (!(aName in this.mPropertyParams)) {
        this.mPropertyParams[aName] = {};
      }
    } else {
      this.deleteProperty(aName);
    }
    if (aName == "LAST-MODIFIED") {
      // setting LAST-MODIFIED cleans/undirties the item, we use this for preserving DTSTAMP
      this.mDirty = false;
    }
  },

  // void deleteProperty(in AString name);
  deleteProperty(aName) {
    this.modify();
    aName = aName.toUpperCase();
    if (this.mIsProxy) {
      // deleting a proxy's property will mark the bag's item as null, so we could
      // distinguish it when enumerating/getting properties from the undefined ones.
      this.mProperties.set(aName, null);
    } else {
      this.mProperties.delete(aName);
    }
    delete this.mPropertyParams[aName];
  },

  // AString getPropertyParameter(in AString aPropertyName,
  //                              in AString aParameterName);
  getPropertyParameter(aPropName, aParamName) {
    let propName = aPropName.toUpperCase();
    let paramName = aParamName.toUpperCase();
    if (propName in this.mPropertyParams && paramName in this.mPropertyParams[propName]) {
      // If the property is not in mPropertyParams, then this just means
      // there are no properties set.
      return this.mPropertyParams[propName][paramName];
    }
    return null;
  },

  // boolean hasPropertyParameter(in AString aPropertyName,
  //                              in AString aParameterName);
  hasPropertyParameter(aPropName, aParamName) {
    let propName = aPropName.toUpperCase();
    let paramName = aParamName.toUpperCase();
    return propName in this.mPropertyParams && paramName in this.mPropertyParams[propName];
  },

  // void setPropertyParameter(in AString aPropertyName,
  //                           in AString aParameterName,
  //                           in AUTF8String aParameterValue);
  setPropertyParameter(aPropName, aParamName, aParamValue) {
    let propName = aPropName.toUpperCase();
    let paramName = aParamName.toUpperCase();
    this.modify();
    if (!(propName in this.mPropertyParams)) {
      if (this.hasProperty(propName)) {
        this.mPropertyParams[propName] = {};
      } else {
        throw new Error("Property " + aPropName + " not set");
      }
    }
    if (aParamValue || !isNaN(parseInt(aParamValue, 10))) {
      this.mPropertyParams[propName][paramName] = aParamValue;
    } else {
      delete this.mPropertyParams[propName][paramName];
    }
    return aParamValue;
  },

  // Array<AString> getParameterNames(in AString aPropertyName);
  getParameterNames(aPropName) {
    let propName = aPropName.toUpperCase();
    if (!(propName in this.mPropertyParams)) {
      if (this.mIsProxy) {
        return this.mParentItem.getParameterNames(aPropName);
      }
      throw new Error("Property " + aPropName + " not set");
    }
    return Object.keys(this.mPropertyParams[propName]);
  },

  // void getAttendees(out PRUint32 count,
  //                   [array,size_is(count),retval] out calIAttendee attendees);
  getAttendees() {
    if (!this.mAttendees && this.mIsProxy) {
      this.mAttendees = this.mParentItem.getAttendees();
    }
    if (this.mAttendees) {
      return this.mAttendees.concat([]); // clone
    }
    return [];
  },

  // calIAttendee getAttendeeById(in AUTF8String id);
  getAttendeeById(id) {
    let attendees = this.getAttendees();
    let lowerCaseId = id.toLowerCase();
    for (let attendee of attendees) {
      // This match must be case insensitive to deal with differing
      // cases of things like MAILTO:
      if (attendee.id.toLowerCase() == lowerCaseId) {
        return attendee;
      }
    }
    return null;
  },

  // void removeAttendee(in calIAttendee attendee);
  removeAttendee(attendee) {
    this.modify();
    let found = false,
      newAttendees = [];
    let attendees = this.getAttendees();
    let attIdLowerCase = attendee.id.toLowerCase();

    for (let i = 0; i < attendees.length; i++) {
      if (attendees[i].id.toLowerCase() == attIdLowerCase) {
        found = true;
      } else {
        newAttendees.push(attendees[i]);
      }
    }
    if (found) {
      this.mAttendees = newAttendees;
    }
  },

  // void removeAllAttendees();
  removeAllAttendees() {
    this.modify();
    this.mAttendees = [];
  },

  // void addAttendee(in calIAttendee attendee);
  addAttendee(attendee) {
    // the duplicate check is migration code for bug 1204255
    let exists = this.getAttendeeById(attendee.id);
    if (exists) {
      cal.LOG(
        "Ignoring attendee duplicate for item " + this.id + " (" + this.title + "): " + exists.id
      );
      if (
        exists.participationStatus == "NEEDS-ACTION" ||
        attendee.participationStatus == "DECLINED"
      ) {
        this.removeAttendee(exists);
      } else {
        attendee = null;
      }
    }
    if (attendee) {
      if (attendee.commonName) {
        // migration code for bug 1209399 to remove leading/training double quotes in
        let commonName = attendee.commonName.replace(/^["]*([^"]*)["]*$/, "$1");
        if (commonName.length == 0) {
          commonName = null;
        }
        if (commonName != attendee.commonName) {
          if (attendee.isMutable) {
            attendee.commonName = commonName;
          } else {
            cal.LOG(
              "Failed to cleanup malformed commonName for immutable attendee " +
                attendee.toString() +
                "\n" +
                cal.STACK(20)
            );
          }
        }
      }
      this.modify();
      this.mAttendees = this.getAttendees();
      this.mAttendees.push(attendee);
    }
  },

  // Array<calIAttachment> getAttachments();
  getAttachments() {
    if (!this.mAttachments && this.mIsProxy) {
      this.mAttachments = this.mParentItem.getAttachments();
    }
    if (this.mAttachments) {
      return this.mAttachments.concat([]); // clone
    }
    return [];
  },

  // void removeAttachment(in calIAttachment attachment);
  removeAttachment(aAttachment) {
    this.modify();
    for (let attIndex in this.mAttachments) {
      if (cal.data.compareObjects(this.mAttachments[attIndex], aAttachment, Ci.calIAttachment)) {
        this.modify();
        this.mAttachments.splice(attIndex, 1);
        break;
      }
    }
  },

  // void addAttachment(in calIAttachment attachment);
  addAttachment(attachment) {
    this.modify();
    this.mAttachments = this.getAttachments();
    if (!this.mAttachments.some(x => x.hashId == attachment.hashId)) {
      this.mAttachments.push(attachment);
    }
  },

  // void removeAllAttachments();
  removeAllAttachments() {
    this.modify();
    this.mAttachments = [];
  },

  // Array<calIRelation> getRelations();
  getRelations() {
    if (!this.mRelations && this.mIsProxy) {
      this.mRelations = this.mParentItem.getRelations();
    }
    if (this.mRelations) {
      return this.mRelations.concat([]);
    }
    return [];
  },

  // void removeRelation(in calIRelation relation);
  removeRelation(aRelation) {
    this.modify();
    for (let attIndex in this.mRelations) {
      // Could we have the same item as parent and as child ?
      if (
        this.mRelations[attIndex].relId == aRelation.relId &&
        this.mRelations[attIndex].relType == aRelation.relType
      ) {
        this.modify();
        this.mRelations.splice(attIndex, 1);
        break;
      }
    }
  },

  // void addRelation(in calIRelation relation);
  addRelation(aRelation) {
    this.modify();
    this.mRelations = this.getRelations();
    this.mRelations.push(aRelation);
    // XXX ensure that the relation isn't already there?
  },

  // void removeAllRelations();
  removeAllRelations() {
    this.modify();
    this.mRelations = [];
  },

  // attribute calICalendar calendar;
  get calendar() {
    if (!this.mCalendar && this.parentItem != this) {
      return this.parentItem.calendar;
    }
    return this.mCalendar;
  },
  set calendar(calendar) {
    if (this.mImmutable) {
      throw Components.Exception("", Cr.NS_ERROR_OBJECT_IS_IMMUTABLE);
    }
    this.mHashId = null; // recompute hashId
    this.mCalendar = calendar;
  },

  // attribute calIAttendee organizer;
  get organizer() {
    if (this.mIsProxy && this.mOrganizer === undefined) {
      return this.mParentItem.organizer;
    }
    return this.mOrganizer;
  },
  set organizer(organizer) {
    this.modify();
    this.mOrganizer = organizer;
  },

  // Array<AString> getCategories();
  getCategories() {
    if (!this.mCategories && this.mIsProxy) {
      this.mCategories = this.mParentItem.getCategories();
    }
    if (this.mCategories) {
      return this.mCategories.concat([]); // clone
    }
    return [];
  },

  // void setCategories(in Array<AString> aCategories);
  setCategories(aCategories) {
    this.modify();
    this.mCategories = aCategories.concat([]);
  },

  // attribute AUTF8String icalString;
  get icalString() {
    throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },
  set icalString(str) {
    throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },

  /**
   * The map of promoted properties is a list of those properties that are
   * represented directly by getters/setters.
   * All of these property names must be in upper case isPropertyPromoted to
   * function correctly. The has/get/set/deleteProperty interfaces
   * are case-insensitive, but these are not.
   */
  itemBasePromotedProps: {
    CREATED: true,
    UID: true,
    "LAST-MODIFIED": true,
    SUMMARY: true,
    PRIORITY: true,
    STATUS: true,
    DTSTAMP: true,
    RRULE: true,
    EXDATE: true,
    RDATE: true,
    ATTENDEE: true,
    ATTACH: true,
    CATEGORIES: true,
    ORGANIZER: true,
    "RECURRENCE-ID": true,
    "X-MOZ-LASTACK": true,
    "RELATED-TO": true,
  },

  /**
   * A map of properties that need translation between the ical component
   * property and their ICS counterpart.
   */
  icsBasePropMap: [
    { cal: "CREATED", ics: "createdTime" },
    { cal: "LAST-MODIFIED", ics: "lastModified" },
    { cal: "DTSTAMP", ics: "stampTime" },
    { cal: "UID", ics: "uid" },
    { cal: "SUMMARY", ics: "summary" },
    { cal: "PRIORITY", ics: "priority" },
    { cal: "STATUS", ics: "status" },
    { cal: "RECURRENCE-ID", ics: "recurrenceId" },
  ],

  /**
   * Walks through the propmap and sets all properties on this item from the
   * given icalcomp.
   *
   * @param icalcomp      The calIIcalComponent to read from.
   * @param propmap       The property map to walk through.
   */
  mapPropsFromICS(icalcomp, propmap) {
    for (let i = 0; i < propmap.length; i++) {
      let prop = propmap[i];
      let val = icalcomp[prop.ics];
      if (val != null && val != Ci.calIIcalComponent.INVALID_VALUE) {
        this.setProperty(prop.cal, val);
      }
    }
  },

  /**
   * Walks through the propmap and sets all properties on the given icalcomp
   * from the properties set on this item.
   * given icalcomp.
   *
   * @param icalcomp      The calIIcalComponent to write to.
   * @param propmap       The property map to walk through.
   */
  mapPropsToICS(icalcomp, propmap) {
    for (let i = 0; i < propmap.length; i++) {
      let prop = propmap[i];
      let val = this.getProperty(prop.cal);
      if (val != null && val != Ci.calIIcalComponent.INVALID_VALUE) {
        icalcomp[prop.ics] = val;
      }
    }
  },

  /**
   * Reads an ical component and sets up the base item's properties to match
   * it.
   *
   * @param icalcomp      The ical component to read.
   */
  setItemBaseFromICS(icalcomp) {
    this.modify();

    // re-initializing from scratch -- no light proxy anymore:
    this.mIsProxy = false;
    this.mProperties = new Map();
    this.mPropertyParams = {};

    this.mapPropsFromICS(icalcomp, this.icsBasePropMap);

    this.mAttendees = []; // don't inherit anything from parent
    for (let attprop of cal.iterate.icalProperty(icalcomp, "ATTENDEE")) {
      let att = new CalAttendee();
      att.icalProperty = attprop;
      this.addAttendee(att);
    }

    this.mAttachments = []; // don't inherit anything from parent
    for (let attprop of cal.iterate.icalProperty(icalcomp, "ATTACH")) {
      let att = new CalAttachment();
      att.icalProperty = attprop;
      this.addAttachment(att);
    }

    this.mRelations = []; // don't inherit anything from parent
    for (let relprop of cal.iterate.icalProperty(icalcomp, "RELATED-TO")) {
      let rel = new CalRelation();
      rel.icalProperty = relprop;
      this.addRelation(rel);
    }

    let org = null;
    let orgprop = icalcomp.getFirstProperty("ORGANIZER");
    if (orgprop) {
      org = new CalAttendee();
      org.icalProperty = orgprop;
      org.isOrganizer = true;
    }
    this.mOrganizer = org;

    this.mCategories = [];
    for (let catprop of cal.iterate.icalProperty(icalcomp, "CATEGORIES")) {
      this.mCategories.push(catprop.value);
    }

    // find recurrence properties
    let rec = null;
    if (!this.recurrenceId) {
      for (let recprop of cal.iterate.icalProperty(icalcomp)) {
        let ritem = null;
        switch (recprop.propertyName) {
          case "RRULE":
          case "EXRULE":
            ritem = cal.createRecurrenceRule();
            break;
          case "RDATE":
          case "EXDATE":
            ritem = cal.createRecurrenceDate();
            break;
          default:
            continue;
        }
        ritem.icalProperty = recprop;

        if (!rec) {
          rec = new CalRecurrenceInfo(this);
        }
        rec.appendRecurrenceItem(ritem);
      }
    }
    this.mRecurrenceInfo = rec;

    this.mAlarms = []; // don't inherit anything from parent
    for (let alarmComp of cal.iterate.icalSubcomponent(icalcomp, "VALARM")) {
      let alarm = new CalAlarm();
      try {
        alarm.icalComponent = alarmComp;
        this.addAlarm(alarm, true);
      } catch (e) {
        cal.ERROR(
          "Invalid alarm for item: " +
            this.id +
            " (" +
            alarmComp.serializeToICS() +
            ")" +
            " exception: " +
            e
        );
      }
    }

    let lastAck = icalcomp.getFirstProperty("X-MOZ-LASTACK");
    this.mAlarmLastAck = null;
    if (lastAck) {
      this.mAlarmLastAck = cal.createDateTime(lastAck.value);
    }

    this.mDirty = false;
  },

  /**
   * Import all properties not in the promoted map into this item's extended
   * properties bag.
   *
   * @param icalcomp      The ical component to read.
   * @param promoted      The map of promoted properties.
   */
  importUnpromotedProperties(icalcomp, promoted) {
    for (let prop of cal.iterate.icalProperty(icalcomp)) {
      let propName = prop.propertyName;
      if (!promoted[propName]) {
        this.setProperty(propName, prop.value);
        for (let [paramName, paramValue] of cal.iterate.icalParameter(prop)) {
          if (!(propName in this.mPropertyParams)) {
            this.mPropertyParams[propName] = {};
          }
          this.mPropertyParams[propName][paramName] = paramValue;
        }
      }
    }
  },

  // boolean isPropertyPromoted(in AString name);
  isPropertyPromoted(name) {
    return this.itemBasePromotedProps[name.toUpperCase()];
  },

  // attribute calIIcalComponent icalComponent;
  get icalComponent() {
    throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },
  set icalComponent(val) {
    throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },

  // attribute PRUint32 generation;
  get generation() {
    let gen = this.getProperty("X-MOZ-GENERATION");
    return gen ? parseInt(gen, 10) : 0;
  },
  set generation(aValue) {
    this.setProperty("X-MOZ-GENERATION", String(aValue));
  },

  /**
   * Fills the passed ical component with the base item's properties.
   *
   * @param icalcomp    The ical component to write to.
   */
  fillIcalComponentFromBase(icalcomp) {
    this.ensureNotDirty();
    let icssvc = cal.getIcsService();

    this.mapPropsToICS(icalcomp, this.icsBasePropMap);

    let org = this.organizer;
    if (org) {
      icalcomp.addProperty(org.icalProperty);
    }

    for (let attendee of this.getAttendees()) {
      icalcomp.addProperty(attendee.icalProperty);
    }

    for (let attachment of this.getAttachments()) {
      icalcomp.addProperty(attachment.icalProperty);
    }

    for (let relation of this.getRelations()) {
      icalcomp.addProperty(relation.icalProperty);
    }

    if (this.mRecurrenceInfo) {
      for (let ritem of this.mRecurrenceInfo.getRecurrenceItems()) {
        icalcomp.addProperty(ritem.icalProperty);
      }
    }

    for (let cat of this.getCategories()) {
      let catprop = icssvc.createIcalProperty("CATEGORIES");
      catprop.value = cat;
      icalcomp.addProperty(catprop);
    }

    if (this.mAlarms) {
      for (let alarm of this.mAlarms) {
        icalcomp.addSubcomponent(alarm.icalComponent);
      }
    }

    let alarmLastAck = this.alarmLastAck;
    if (alarmLastAck) {
      let lastAck = cal.getIcsService().createIcalProperty("X-MOZ-LASTACK");
      // - should we further ensure that those are UTC or rely on calAlarmService doing so?
      lastAck.value = alarmLastAck.icalString;
      icalcomp.addProperty(lastAck);
    }
  },

  // Array<calIAlarm> getAlarms();
  getAlarms() {
    if (!this.mAlarms && this.mIsProxy) {
      this.mAlarms = this.mParentItem.getAlarms();
    }
    if (this.mAlarms) {
      return this.mAlarms.concat([]); // clone
    }
    return [];
  },

  /**
   * Adds an alarm. The second parameter is for internal use only, i.e not
   * provided on the interface.
   *
   * @see calIItemBase
   * @param aDoNotValidate    Don't serialize the component to check for
   *                            errors.
   */
  addAlarm(aAlarm, aDoNotValidate) {
    if (!aDoNotValidate) {
      try {
        // Trigger the icalComponent getter to make sure the alarm is valid.
        aAlarm.icalComponent; // eslint-disable-line no-unused-expressions
      } catch (e) {
        throw Components.Exception("", Cr.NS_ERROR_INVALID_ARG);
      }
    }

    this.modify();
    this.mAlarms = this.getAlarms();
    this.mAlarms.push(aAlarm);
  },

  // void deleteAlarm(in calIAlarm aAlarm);
  deleteAlarm(aAlarm) {
    this.modify();
    this.mAlarms = this.getAlarms();
    for (let i = 0; i < this.mAlarms.length; i++) {
      if (cal.data.compareObjects(this.mAlarms[i], aAlarm, Ci.calIAlarm)) {
        this.mAlarms.splice(i, 1);
        break;
      }
    }
  },

  // void clearAlarms();
  clearAlarms() {
    this.modify();
    this.mAlarms = [];
  },

  // Array<calIItemBase> getOccurrencesBetween(in calIDateTime aStartDate, in calIDateTime aEndDate);
  getOccurrencesBetween(aStartDate, aEndDate) {
    if (this.recurrenceInfo) {
      return this.recurrenceInfo.getOccurrences(aStartDate, aEndDate, 0);
    }

    if (cal.item.checkIfInRange(this, aStartDate, aEndDate)) {
      return [this];
    }

    return [];
  },
};

makeMemberAttrProperty(calItemBase, "CREATED", "creationDate");
makeMemberAttrProperty(calItemBase, "SUMMARY", "title");
makeMemberAttrProperty(calItemBase, "PRIORITY", "priority");
makeMemberAttrProperty(calItemBase, "CLASS", "privacy");
makeMemberAttrProperty(calItemBase, "STATUS", "status");
makeMemberAttrProperty(calItemBase, "ALARMTIME", "alarmTime");

/**
 * Adds a member attribute to the given prototype.
 *
 * @param {Function} ctor       The constructor function of the prototype.
 * @param {string} varname      The variable name to get/set.
 * @param {string} attr         The attribute name to be used.
 * @param {*} dflt              The default value in case none is set.
 */
function makeMemberAttr(ctor, varname, attr, dflt) {
  let getter = function() {
    return varname in this ? this[varname] : dflt;
  };
  let setter = function(value) {
    this.modify();
    this[varname] = value;
    return value;
  };

  ctor.prototype.__defineGetter__(attr, getter);
  ctor.prototype.__defineSetter__(attr, setter);
}

/**
 * Adds a member attribute to the given prototype, using `getProperty` and
 * `setProperty` for access.
 *
 * Default values are not handled here, but instead are set in constructors,
 * which makes it possible to e.g. iterate through `mProperties` when cloning
 * an object.
 *
 * @param {Function} ctor       The constructor function of the prototype.
 * @param {string} name         The property name to get/set.
 * @param {string} attr         The attribute name to be used.
 */
function makeMemberAttrProperty(ctor, name, attr) {
  let getter = function() {
    return this.getProperty(name);
  };
  let setter = function(value) {
    this.modify();
    return this.setProperty(name, value);
  };
  ctor.prototype.__defineGetter__(attr, getter);
  ctor.prototype.__defineSetter__(attr, setter);
}
