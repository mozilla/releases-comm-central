/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* This file contains commonly used functions in a centralized place so that
 * various components (and other js scopes) don't need to replicate them. Note
 * that loading this file twice in the same scope will throw errors.
 */

/* exported getCalendarDirectory, attendeeMatchesAddresses,
 *          calRadioGroupSelectItem, getPrefCategoriesArray,
 *          setPrefCategoriesFromArray, calTryWrappedJSObject, LOG, WARN,
 *          ERROR, showError, getContrastingTextColor, sendMailTo,
 *          applyAttributeToMenuChildren, isPropertyValueSame,
 *          getParentNodeOrThis, getParentNodeOrThisByAttribute,
 *          calIterateEmailIdentities, getCompositeCalendar
 */

ChromeUtils.import("resource:///modules/mailServices.js");
ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource://gre/modules/Preferences.jsm");
ChromeUtils.import("resource://gre/modules/AppConstants.jsm");


/**
 * Shared dialog functions
 * Gets the calendar directory, defaults to <profile-dir>/calendar
 */
function getCalendarDirectory() {
    if (getCalendarDirectory.mDir === undefined) {
        let dir = Services.dirsvc.get("ProfD", Components.interfaces.nsIFile);
        dir.append("calendar-data");
        if (!dir.exists()) {
            try {
                dir.create(Components.interfaces.nsIFile.DIRECTORY_TYPE,
                           parseInt("0700", 8));
            } catch (exc) {
                ASSERT(false, exc);
                throw exc;
            }
        }
        getCalendarDirectory.mDir = dir;
    }
    return getCalendarDirectory.mDir.clone();
}

/**
 * Check if the attendee object matches one of the addresses in the list. This
 * is useful to determine whether the current user acts as a delegate.
 *
 * @param aAttendee     The reference attendee object
 * @param addresses     The list of addresses
 * @return              True if there is a match
 */
function attendeeMatchesAddresses(anAttendee, addresses) {
    let attId = anAttendee.id;
    if (!attId.match(/^mailto:/i)) {
        // Looks like its not a normal attendee, possibly urn:uuid:...
        // Try getting the email through the EMAIL property.
        let emailProp = anAttendee.getProperty("EMAIL");
        if (emailProp) {
            attId = emailProp;
        }
    }

    attId = attId.toLowerCase().replace(/^mailto:/, "");
    for (let address of addresses) {
        if (attId == address.toLowerCase().replace(/^mailto:/, "")) {
            return true;
        }
    }

    return false;
}

/**
 * Other functions
 */

/**
 * Get array of category names from preferences or locale default,
 * unescaping any commas in each category name.
 * @return array of category names
 */
function getPrefCategoriesArray() {
    let categories = Preferences.get("calendar.categories.names", null);

    // If no categories are configured load a default set from properties file
    if (!categories) {
        categories = setupDefaultCategories();
    }
    return categoriesStringToArray(categories);
}

/**
 * Sets up the default categories from the localized string
 *
 * @return      The default set of categories as a comma separated string.
 */
function setupDefaultCategories() {
    // First, set up the category names
    let categories = calGetString("categories", "categories2");
    Preferences.set("calendar.categories.names", categories);

    // Now, initialize the category default colors
    let categoryArray = categoriesStringToArray(categories);
    for (let category of categoryArray) {
        let prefName = cal.view.formatStringForCSSRule(category);
        Preferences.set("calendar.category.color." + prefName,
                        cal.view.hashColor(category));
    }

    // Return the list of categories for further processing
    return categories;
}

/**
 * Convert categories string to list of category names.
 *
 * Stored categories may include escaped commas within a name.
 * Split categories string at commas, but not at escaped commas (\,).
 * Afterward, replace escaped commas (\,) with commas (,) in each name.
 * @param aCategoriesPrefValue string from "calendar.categories.names" pref,
 * which may contain escaped commas (\,) in names.
 * @return list of category names
 */
function categoriesStringToArray(aCategories) {
    if (!aCategories) {
        return [];
    }
    // \u001A is the unicode "SUBSTITUTE" character
    function revertCommas(name) { return name.replace(/\u001A/g, ","); }
    let categories = aCategories.replace(/\\,/g, "\u001A").split(",").map(revertCommas);
    if (categories.length == 1 && categories[0] == "") {
        // Split will return an array with an empty element when splitting an
        // empty string, correct this.
        categories.pop();
    }
    return categories;
}

/**
 * Set categories preference, escaping any commas in category names.
 * @param aCategoriesArray array of category names,
 * may contain unescaped commas which will be escaped in combined pref.
 */
function setPrefCategoriesFromArray(aCategoriesArray) {
    Preferences.set("calendar.categories.names",
                     categoriesArrayToString(aCategoriesList));
}

/**
 * Convert array of category names to string.
 *
 * Category names may contain commas (,).  Escape commas (\,) in each,
 * then join them in comma separated string for storage.
 * @param aSortedCategoriesArray sorted array of category names,
 * may contain unescaped commas, which will be escaped in combined string.
 */
function categoriesArrayToString(aSortedCategoriesArray) {
    function escapeComma(category) { return category.replace(/,/g, "\\,"); }
    return aSortedCategoriesArray.map(escapeComma).join(",");
}

/**
 * Gets the value of a string in a .properties file from the calendar bundle
 *
 * @param aBundleName  the name of the properties file.  It is assumed that the
 *                     file lives in chrome://calendar/locale/
 * @param aStringName  the name of the string within the properties file
 * @param aParams      optional array of parameters to format the string
 * @param aComponent   optional stringbundle component name
 */
function calGetString(aBundleName, aStringName, aParams, aComponent="calendar") {
    let propName = "chrome://" + aComponent + "/locale/" + aBundleName + ".properties";

    try {
        let props = Services.strings.createBundle(propName);

        if (aParams && aParams.length) {
            return props.formatStringFromName(aStringName, aParams, aParams.length);
        } else {
            return props.GetStringFromName(aStringName);
        }
    } catch (ex) {
        let msg = "Failed to read '" + aStringName + "' from " + propName + ".";
        Components.utils.reportError(msg + " Error: " + ex);
        return msg;
    }
}

/**
 * Make a UUID using the UUIDGenerator service available, we'll use that.
 */
function getUUID() {
    let uuidGen = Components.classes["@mozilla.org/uuid-generator;1"]
                            .getService(Components.interfaces.nsIUUIDGenerator);
    // generate uuids without braces to avoid problems with
    // CalDAV servers that don't support filenames with {}
    return uuidGen.generateUUID().toString().replace(/[{}]/g, "");
}

/**
 * Tries to get rid of wrappers. This is used to avoid cyclic references, and thus leaks.
 */
function calTryWrappedJSObject(obj) {
    if (obj && obj.wrappedJSObject) {
        obj = obj.wrappedJSObject;
    }
    return obj;
}


/**
 * Helper used in the following log functions to actually log the message.
 * Should not be used outside of this file.
 */
function _log(message, flag) {
    let frame = Components.stack.caller.caller;
    let filename = frame.filename ? frame.filename.split(" -> ").pop() : null;
    let scriptError = Components.classes["@mozilla.org/scripterror;1"]
                                .createInstance(Components.interfaces.nsIScriptError);
    scriptError.init(message, filename, null, frame.lineNumber, frame.columnNumber,
                     flag, "component javascript");
    Services.console.logMessage(scriptError);
}

/**
 * Logs a string or an object to both stderr and the js-console only in the case
 * where the calendar.debug.log pref is set to true.
 *
 * @param aArg  either a string to log or an object whose entire set of
 *              properties should be logged.
 */
function LOG(aArg) {
    if (!Preferences.get("calendar.debug.log", false)) {
        return;
    }

    ASSERT(aArg, "Bad log argument.", false);
    let string = aArg;
    // We should just dump() both String objects, and string primitives.
    if (!(aArg instanceof String) && !(typeof aArg == "string")) {
        string = "Logging object...\n";
        for (let prop in aArg) {
            string += prop + ": " + aArg[prop] + "\n";
        }
        string += "End object\n";
    }

    dump(string + "\n");
    _log(string, Components.interfaces.nsIScriptError.infoFlag);
}

/**
 * Dumps a warning to both console and js console.
 *
 * @param aMessage warning message
 */
function WARN(aMessage) {
    dump("Warning: " + aMessage + "\n");
    _log(aMessage, Components.interfaces.nsIScriptError.warningFlag);
}

/**
 * Dumps an error to both console and js console.
 *
 * @param aMessage error message
 */
function ERROR(aMessage) {
    dump("Error: " + aMessage + "\n");
    _log(aMessage, Components.interfaces.nsIScriptError.errorFlag);
}

/**
 * Returns a string describing the current js-stack with filename and line
 * numbers.
 *
 * @param aDepth (optional) The number of frames to include. Defaults to 5.
 * @param aSkip  (optional) Number of frames to skip
 */
function STACK(aDepth, aSkip) {
    let depth = aDepth || 10;
    let skip = aSkip || 0;
    let stack = "";
    let frame = Components.stack.caller;
    for (let i = 1; i <= depth + skip && frame; i++) {
        if (i > skip) {
            stack += i + ": [" + frame.filename + ":" +
                     frame.lineNumber + "] " + frame.name + "\n";
        }
        frame = frame.caller;
    }
    return stack;
}

/**
 * Logs a message and the current js-stack, if aCondition fails
 *
 * @param aCondition  the condition to test for
 * @param aMessage    the message to report in the case the assert fails
 * @param aCritical   if true, throw an error to stop current code execution
 *                    if false, code flow will continue
 *                    may be a result code
 */
function ASSERT(aCondition, aMessage, aCritical) {
    if (aCondition) {
        return;
    }

    let string = "Assert failed: " + aMessage + "\n" + STACK(0, 1);
    if (aCritical) {
        throw new Components.Exception(string,
                                       aCritical === true ? Components.results.NS_ERROR_UNEXPECTED : aCritical);
    } else {
        Components.utils.reportError(string);
    }
}

/**
 * Uses the prompt service to display an error message.
 *
 * @param aMsg The message to be shown
 * @param aWindow The window to show the message in, or null for any window.
 */
function showError(aMsg, aWindow=null) {
    Services.prompt.alert(aWindow, cal.calGetString("calendar", "genericErrorTitle"), aMsg);
}

function sendMailTo(aRecipient, aSubject, aBody, aIdentity) {
    let msgParams = Components.classes["@mozilla.org/messengercompose/composeparams;1"]
                              .createInstance(Components.interfaces.nsIMsgComposeParams);
    let composeFields = Components.classes["@mozilla.org/messengercompose/composefields;1"]
                                  .createInstance(Components.interfaces.nsIMsgCompFields);

    composeFields.to = aRecipient;
    composeFields.subject = aSubject;
    composeFields.body = aBody;

    msgParams.type = Components.interfaces.nsIMsgCompType.New;
    msgParams.format = Components.interfaces.nsIMsgCompFormat.Default;
    msgParams.composeFields = composeFields;
    msgParams.identity = aIdentity;

    MailServices.compose.OpenComposeWindowWithParams(null, msgParams);
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
function calOperationGroup(cancelFunc) {
    this.wrappedJSObject = this;
    if (calOperationGroup.mOpGroupId === undefined) {
        calOperationGroup.mOpGroupId = 0;
    }
    if (calOperationGroup.mOpGroupPrefix === undefined) {
        calOperationGroup.mOpGroupPrefix = getUUID() + "-";
    }
    this.mCancelFunc = cancelFunc;
    this.mId = calOperationGroup.mOpGroupPrefix + calOperationGroup.mOpGroupId++;
    this.mSubOperations = [];
}
calOperationGroup.prototype = {
    mCancelFunc: null,
    mId: null,
    mIsPending: true,
    mStatus: Components.results.NS_OK,
    mSubOperations: null,

    add: function(aOperation) {
        if (aOperation && aOperation.isPending) {
            this.mSubOperations.push(aOperation);
        }
    },

    remove: function(aOperation) {
        if (aOperation) {
            this.mSubOperations = this.mSubOperations.filter(operation => aOperation.id != operation.id);
        }
    },

    get isEmpty() {
        return (this.mSubOperations.length == 0);
    },

    notifyCompleted: function(status) {
        ASSERT(this.isPending, "[calOperationGroup_notifyCompleted] this.isPending");
        if (this.isPending) {
            this.mIsPending = false;
            if (status) {
                this.mStatus = status;
            }
        }
    },

    toString: function() {
        return "[calOperationGroup] id=" + this.id;
    },

    // calIOperation:
    get id() {
        return this.mId;
    },

    get isPending() {
        return this.mIsPending;
    },

    get status() {
        return this.mStatus;
    },

    cancel: function(status) {
        if (this.isPending) {
            if (!status) {
                status = Components.interfaces.calIErrors.OPERATION_CANCELLED;
            }
            this.notifyCompleted(status);
            let cancelFunc = this.mCancelFunc;
            if (cancelFunc) {
                this.mCancelFunc = null;
                cancelFunc();
            }
            let subOperations = this.mSubOperations;
            this.mSubOperations = [];
            for (let operation of subOperations) {
                operation.cancel(Components.interfaces.calIErrors.OPERATION_CANCELLED);
            }
        }
    }
};

/**
 * TODO: The following UI-related functions need to move somewhere different,
 * i.e calendar-ui-utils.js
 */


/**
 * compares the value of a property of an array of objects and returns
 * true or false if it is same or not among all array members
 *
 * @param aObjects An Array of Objects to inspect
 * @param aProperty Name the name of the Property of which the value is compared
 */
function isPropertyValueSame(aObjects, aPropertyName) {
    let value = null;
    for (let i = 0; i < aObjects.length; i++) {
        if (!value) {
            value = aObjects[0][aPropertyName];
        }
        let compValue = aObjects[i][aPropertyName];
        if (compValue != value) {
            return false;
        }
    }
    return true;
}

/**
 * END TODO: The above UI-related functions need to move somewhere different,
 * i.e calendar-ui-utils.js
 */

/**
 * Iterates all email identities and calls the passed function with identity and account.
 * If the called function returns false, iteration is stopped.
 */
function calIterateEmailIdentities(func) {
    let accounts = MailServices.accounts.accounts;
    for (let i = 0; i < accounts.length; ++i) {
        let account = accounts.queryElementAt(i, Components.interfaces.nsIMsgAccount);
        let identities = account.identities;
        for (let j = 0; j < identities.length; ++j) {
            let identity = identities.queryElementAt(j, Components.interfaces.nsIMsgIdentity);
            if (!func(identity, account)) {
                break;
            }
        }
    }
}
