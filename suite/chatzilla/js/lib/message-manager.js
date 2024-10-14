/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//
function MessageManager(entities)
{
    this.ucConverter = Cc["@mozilla.org/intl/scriptableunicodeconverter"]
                         .getService(Ci.nsIScriptableUnicodeConverter);
    this.defaultBundle = null;
    this.bundleList = new Array();
    // Provide a fallback so we don't break getMsg and related constants later.
    this.entities = entities || {};
}

MessageManager.prototype.loadBrands =
function mm_loadbrands()
{
    let brandPath = "chrome://branding/locale/brand.properties";
    let bundle = Services.strings.createBundle(brandPath);
    this.entities.brandShortName = bundle.GetStringFromName("brandShortName");
    this.entities.brandFullName = bundle.GetStringFromName("brandFullName");
    this.entities.vendorShortName = bundle.GetStringFromName("vendorShortName");
}

MessageManager.prototype.addBundle = 
function mm_addbundle(bundlePath, targetWindow)
{
    let bundle = Services.strings.createBundle(bundlePath);
    this.bundleList.push(bundle);

    // The bundle will load if the file doesn't exist. This will fail though.
    // We want to be clean and remove the bundle again.
    try
    {
        this.importBundle(bundle, targetWindow, this.bundleList.length - 1);
    }
    catch (exception)
    {
        // Clean up and return the exception.
        this.bundleList.pop();
        throw exception;
    }
    return bundle;
}

MessageManager.prototype.importBundle =
function mm_importbundle(bundle, targetWindow, index)
{
    var me = this;
    function replaceEntities(matched, entity)
    {
        if (entity in me.entities)
            return me.entities[entity];

        return matched;
    };

    if (!targetWindow)
        targetWindow = window;

    if (typeof index == "undefined")
        index = this.bundleList.indexOf(bundle);
    
    var pfx;
    if (index == 0)
        pfx = "";
    else
        pfx = index + ":";

    var enumer = bundle.getSimpleEnumeration();

    while (enumer.hasMoreElements())
    {
        var prop = enumer.getNext().QueryInterface(Ci.nsIPropertyElement);
        var ary = prop.key.match (/^(msg|msn)/);
        if (ary)
        {
            var constValue;
            var constName = prop.key.toUpperCase().replace (/\./g, "_");
            if (ary[1] == "msn" || prop.value.search(/%(\d+\$)?s/i) != -1)
                constValue = pfx + prop.key;
            else
                constValue = prop.value.replace (/^\"/, "").replace (/\"$/, "");

            constValue = constValue.replace(/\&(\w+)\;/g, replaceEntities);
            targetWindow[constName] = constValue;
        }
    }

    if (this.bundleList.length == 1)
        this.defaultBundle = bundle;
}

MessageManager.prototype.checkCharset =
function mm_checkset(charset)
{
    try
    {
        this.ucConverter.charset = charset;
    }
    catch (ex)
    {
        return false;
    }
    
    return true;
}

MessageManager.prototype.toUnicode =
function mm_tounicode(msg, charset)
{
    if (!charset)
        return msg;
    
    try
    {
        this.ucConverter.charset = charset;
        msg = this.ucConverter.ConvertToUnicode(msg);
    }
    catch (ex)
    {
        //dd ("caught exception " + ex + " converting " + msg + " to charset " +
        //    charset);
    }

    return msg;
}

MessageManager.prototype.fromUnicode =
function mm_fromunicode(msg, charset)
{
    if (!charset)
        return msg;

    try
    {
        // This can actually fail in bizare cases. Cope.
        if (charset != this.ucConverter.charset)
            this.ucConverter.charset = charset;

        msg = this.ucConverter.ConvertFromUnicode(msg) +
              this.ucConverter.Finish();
    }
    catch (ex)
    {
        //dd ("caught exception " + ex + " converting " + msg + " to charset " +
        //    charset);
    }
    
    return msg;
}

MessageManager.prototype.getMsg = 
function mm_getmsg (msgName, params, deflt)
{
    try
    {    
        var bundle;
        var ary = msgName.match (/(\d+):(.+)/);
        if (ary)
        {
            return (this.getMsgFrom(this.bundleList[ary[1]], ary[2], params,
                                    deflt));
        }
        
        return this.getMsgFrom(this.bundleList[0], msgName, params, deflt);
    }
    catch (ex)
    {
        ASSERT (0, "Caught exception getting message: " + msgName + "/" +
                params);
        return deflt ? deflt : msgName;
    }
}

MessageManager.prototype.getMsgFrom =
function mm_getfrom (bundle, msgName, params, deflt)
{
    var me = this;
    function replaceEntities(matched, entity)
    {
        if (entity in me.entities)
            return me.entities[entity];

        return matched;
    };

    try 
    {
        var rv;
        
        if (params && isinstance(params, Array))
            rv = bundle.formatStringFromName (msgName, params, params.length);
        else if (params || params == 0)
            rv = bundle.formatStringFromName (msgName, [params], 1);
        else
            rv = bundle.GetStringFromName (msgName);
        
        /* strip leading and trailing quote characters, see comment at the
         * top of venkman.properties.
         */
        rv = rv.replace(/^\"/, "");
        rv = rv.replace(/\"$/, "");
        rv = rv.replace(/\&(\w+)\;/g, replaceEntities);

        return rv;
    }
    catch (ex)
    {
        if (typeof deflt == "undefined")
        {
            ASSERT (0, "caught exception getting value for ``" + msgName +
                    "''\n" + ex + "\n");
            return msgName;
        }
        return deflt;
    }

    return null;
}
