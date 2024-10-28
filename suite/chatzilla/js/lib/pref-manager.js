/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const PREF_RELOAD = true;
const PREF_WRITETHROUGH = true;
const PREF_CHARSET = "utf-8";   // string prefs stored in this charset

function PrefRecord(name, defaultValue, label, help, group)
{
    this.name = name;
    this.defaultValue = defaultValue;
    this.help = help;
    this.label = label ? label : name;
    this.group = group ? group : "";
    // Prepend the group 'general' if there isn't one already.
    if (this.group.match(/^(\.|$)/))
        this.group = "general" + this.group;
    this.realValue = null;
}

function PrefManager (branchName, defaultBundle)
{
    var prefManager = this;

    function pm_observe (prefService, topic, prefName)
    {
        prefManager.onPrefChanged(prefName);
    };

    const PREF_CTRID = "@mozilla.org/preferences-service;1";
    const nsIPrefService = Components.interfaces.nsIPrefService;
    const nsIPrefBranch = Components.interfaces.nsIPrefBranch;

    this.prefService =
        Components.classes[PREF_CTRID].getService(nsIPrefService);
    this.prefBranch = this.prefService.getBranch(branchName);
    this.prefSaveTime = 0;
    this.prefSaveTimer = 0;
    this.branchName = branchName;
    this.defaultValues = new Object();
    this.prefs = new Object();
    this.prefNames = new Array();
    this.prefRecords = new Object();
    this.observer = { observe: pm_observe, branch: branchName };
    this.observers = new Array();

    this.nsIPrefBranch =
        this.prefBranch.QueryInterface(nsIPrefBranch);
    this.nsIPrefBranch.addObserver("", this.observer, false);

    this.defaultBundle = defaultBundle;

    this.valid = true;
}

// Delay between change and save.
PrefManager.prototype.PREF_SAVE_DELAY =  5000; // 5 seconds.
/* The timer is reset for each change. Only reset if it hasn't been delayed by
 * this much already, or we could put off a save indefinitely.
 */
PrefManager.prototype.PREF_MAX_DELAY  = 15000; // 15 seconds.

//
PrefManager.prototype.destroy =
function pm_destroy()
{
    if (this.valid)
    {
        this.nsIPrefBranch.removeObserver("", this.observer);
        this.valid = false;
    }
}

PrefManager.prototype.addObserver =
function pm_addobserver(observer)
{
    if (!("onPrefChanged" in observer))
        throw "Bad observer!";

    this.observers.push(observer);
}

PrefManager.prototype.removeObserver =
function pm_removeobserver(observer)
{
    let idx = this.observers.indexOf(observer);
    if (idx >= 0)
    {
        this.observers.splice(idx, 1);
    }
}

PrefManager.prototype.delayedSave =
function pm_delayedsave()
{
    // this.prefSaveTimer
    var now = Number(new Date());

    /* If the time == 0, there is no delayed save in progress, and we should
     * start one. If it isn't 0, check the delayed save was started within the
     * allowed time - this means that if we keep putting off a save, it will
     * go through eventually, as we will stop resetting it.
     */
    if ((this.prefSaveTime == 0) ||
        (now - this.prefSaveTime < this.PREF_MAX_DELAY))
    {
        if (this.prefSaveTime == 0)
            this.prefSaveTime = now;
        if (this.prefSaveTimer != 0)
            clearTimeout(this.prefSaveTimer);
        this.prefSaveTimer = setTimeout(function(o) { o.forceSave() },
                                        this.PREF_SAVE_DELAY, this);
    }
}

PrefManager.prototype.forceSave =
function pm_forcesave()
{
    this.prefSaveTime = 0;
    this.prefSaveTimer = 0;
    try {
        this.prefService.savePrefFile(null);
    } catch(ex) {
        dd("Exception saving preferences: " + formatException(ex));
    }
}

PrefManager.prototype.onPrefChanged =
function pm_prefchanged(prefName, realValue, oldValue)
{
    var r, oldValue;
    // We're only interested in prefs we actually know about.
    if (!(prefName in this.prefRecords) || !(r = this.prefRecords[prefName]))
        return;

    if (r.realValue != null)
        oldValue = r.realValue;
    else if (typeof r.defaultValue == "function")
        oldValue = r.defaultValue(prefName);
    else
        oldValue = r.defaultValue;

    var realValue = this.getPref(prefName, PREF_RELOAD);

    for (var i = 0; i < this.observers.length; i++)
        this.observers[i].onPrefChanged(prefName, realValue, oldValue);
}

PrefManager.prototype.listPrefs =
function pm_listprefs (prefix)
{
    var list = new Array();
    var names = this.prefNames;
    for (var i = 0; i < names.length; ++i)
    {
        if (!prefix || names[i].indexOf(prefix) == 0)
            list.push (names[i]);
    }

    return list;
}

PrefManager.prototype.isKnownPref =
function pm_ispref(prefName)
{
    return (prefName in this.prefRecords);
}

PrefManager.prototype.addPrefs =
function pm_addprefs(prefSpecs)
{
    var bundle = "stringBundle" in prefSpecs ? prefSpecs.stringBundle : null;
    for (var i = 0; i < prefSpecs.length; ++i)
    {
        this.addPref(prefSpecs[i][0], prefSpecs[i][1],
                     3 in prefSpecs[i] ? prefSpecs[i][3] : null, bundle,
                     2 in prefSpecs[i] ? prefSpecs[i][2] : null);
    }
}

PrefManager.prototype.updateArrayPref =
function pm_arrayupdate(prefName)
{
    var record = this.prefRecords[prefName];
    if (!ASSERT(record, "Unknown pref: " + prefName))
        return;

    if (record.realValue == null)
        record.realValue = record.defaultValue;

    if (!ASSERT(isinstance(record.realValue, Array), "Pref is not an array"))
        return;

    this.prefBranch.setCharPref(prefName, this.arrayToString(record.realValue));
    this.delayedSave();
}

PrefManager.prototype.stringToArray =
function pm_s2a(string)
{
    if (string.search(/\S/) == -1)
        return [];

    var ary = string.split(/\s*;\s*/);
    for (var i = 0; i < ary.length; ++i)
        ary[i] = toUnicode(unescape(ary[i]), PREF_CHARSET);

    return ary;
}

PrefManager.prototype.arrayToString =
function pm_a2s(ary)
{
    var escapedAry = new Array()
    for (var i = 0; i < ary.length; ++i)
        escapedAry[i] = escape(fromUnicode(ary[i], PREF_CHARSET));

    return escapedAry.join("; ");
}

PrefManager.prototype.getPref =
function pm_getpref(prefName, reload)
{
    var prefManager = this;

    function updateArrayPref() { prefManager.updateArrayPref(prefName); };

    var record = this.prefRecords[prefName];
    if (!ASSERT(record, "Unknown pref: " + prefName))
        return null;

    var defaultValue;

    if (typeof record.defaultValue == "function")
    {
        // deferred pref, call the getter, and don't cache the result.
        defaultValue = record.defaultValue(prefName);
    }
    else
    {
        if (!reload && record.realValue != null)
            return record.realValue;

        defaultValue = record.defaultValue;
    }

    var realValue = defaultValue;

    try
    {
        if (typeof defaultValue == "boolean")
        {
            realValue = this.prefBranch.getBoolPref(prefName);
        }
        else if (typeof defaultValue == "number")
        {
            realValue = this.prefBranch.getIntPref(prefName);
        }
        else if (isinstance(defaultValue, Array))
        {
            realValue = this.prefBranch.getCharPref(prefName);
            realValue = this.stringToArray(realValue);
            realValue.update = updateArrayPref;
        }
        else if (typeof defaultValue == "string" ||
                 defaultValue == null)
        {
            realValue = toUnicode(this.prefBranch.getCharPref(prefName),
                                  PREF_CHARSET);
        }
    }
    catch (ex)
    {
        // if the pref doesn't exist, ignore the exception.
    }

    record.realValue = realValue;
    return realValue;
}

PrefManager.prototype.setPref =
function pm_setpref(prefName, value)
{
    var prefManager = this;

    function updateArrayPref() { prefManager.updateArrayPref(prefName); };

    var record = this.prefRecords[prefName];
    if (!ASSERT(record, "Unknown pref: " + prefName))
        return null;

    var defaultValue = record.defaultValue;

    if (typeof defaultValue == "function")
        defaultValue = defaultValue(prefName);

    if ((record.realValue == null && value == defaultValue) ||
        record.realValue == value)
    {
        // no realvalue, and value is the same as default value ... OR ...
        // no change at all.  just bail.
        return record.realValue;
    }

    if (value == defaultValue)
    {
        this.clearPref(prefName);
        return value;
    }

    if (typeof defaultValue == "boolean")
    {
        this.prefBranch.setBoolPref(prefName, value);
    }
    else if (typeof defaultValue == "number")
    {
        this.prefBranch.setIntPref(prefName, value);
    }
    else if (isinstance(defaultValue, Array))
    {
        var str = this.arrayToString(value);
        this.prefBranch.setCharPref(prefName, str);
        value.update = updateArrayPref;
    }
    else
    {
        this.prefBranch.setCharPref(prefName, fromUnicode(value, PREF_CHARSET));
    }
    this.delayedSave();

    // Always update this after changing the preference.
    record.realValue = value;

    return value;
}

PrefManager.prototype.clearPref =
function pm_reset(prefName)
{
    try {
        this.prefBranch.clearUserPref(prefName);
    } catch(ex) {
        // Do nothing, the pref didn't exist.
    }
    this.delayedSave();

    // Always update this after changing the preference.
    this.prefRecords[prefName].realValue = null;
}

PrefManager.prototype.addPref =
function pm_addpref(prefName, defaultValue, setter, bundle, group)
{
    var prefManager = this;
    if (!bundle)
        bundle = this.defaultBundle;

    function updateArrayPref() { prefManager.updateArrayPref(prefName); };
    function prefGetter() { return prefManager.getPref(prefName); };
    function prefSetter(value) { return prefManager.setPref(prefName, value); };

    if (!ASSERT(!(prefName in this.defaultValues),
                "Preference already exists: " + prefName))
    {
        return;
    }

    if (!setter)
        setter = prefSetter;

    if (isinstance(defaultValue, Array))
        defaultValue.update = updateArrayPref;

    var label = getMsgFrom(bundle, "pref." + prefName + ".label", null, prefName);
    var help  = getMsgFrom(bundle, "pref." + prefName + ".help", null,
                           MSG_NO_HELP);
    if (group != "hidden")
    {
        if (label == prefName)
            dd("WARNING: !!! Preference without label: " + prefName);
        if (help == MSG_NO_HELP)
            dd("WARNING: Preference without help text: " + prefName);
    }

    this.prefRecords[prefName] = new PrefRecord (prefName, defaultValue,
                                                 label, help, group);

    this.prefNames.push(prefName);
    this.prefNames.sort();

    this.prefs.__defineGetter__(prefName, prefGetter);
    this.prefs.__defineSetter__(prefName, setter);
}
