/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var ownerClient = null;

// To be able to load static.js, we need a few things defined first:
function CIRCNetwork() {}
function CIRCServer() {}
function CIRCChannel() {}
function CIRCUser() {}
function CIRCChanUser() {}
function CIRCDCCUser() {}
function CIRCDCCChat() {}
function CIRCDCCFile() {}
function CIRCDCCFileTransfer() {}
function CIRCSTS() {}

// Our friend from messages.js:
function getMsg(msgName, params, deflt)
{
    return client.messageManager.getMsg(msgName, params, deflt);
}

function onLoad()
{
    const propsPath = "chrome://chatzilla/locale/chatzilla.properties";

    // Find our owner, if we have one.
    ownerClient = window.arguments ? window.arguments[0].client : null;
    if (ownerClient)
        ownerClient.aboutDialog = window;

    client.entities = new Object();
    client.messageManager = new MessageManager(client.entities);
    client.messageManager.loadBrands();
    client.defaultBundle = client.messageManager.addBundle(propsPath);

    var version = getVersionInfo();
    client.userAgent = getMsg(MSG_VERSION_REPLY, [version.cz, version.ua]);

    var verLabel = document.getElementById("version");
    var verString = verLabel.getAttribute("format").replace("%S", version.cz);
    verLabel.setAttribute("value", verString);
    verLabel.setAttribute("condition", __cz_condition);

    var localizers = document.getElementById("localizers");
    var localizerNames = getMsg("locale.authors", null, "");
    if (localizerNames && (localizerNames.substr(0, 11) != "XXX REPLACE"))
    {
        localizerNames = localizerNames.split(/\s*;\s*/);

        for (var i = 0; i < localizerNames.length; i++) {
            var loc = document.createElement("label");
            loc.setAttribute("value", localizerNames[i]);
            localizers.appendChild(loc);
        }
    }
    else
    {
        var localizersHeader = document.getElementById("localizers-header");
        localizersHeader.style.display = "none";
        localizers.style.display = "none";
    }

    if (window.opener)
    {
        // Force the window to be the right size now, not later.
        window.sizeToContent();

        // Position it centered over, but never up or left of parent.
        var opener = window.opener;
        var sx = Math.max((opener.outerWidth  - window.outerWidth ) / 2, 0);
        var sy = Math.max((opener.outerHeight - window.outerHeight) / 2, 0);
        window.moveTo(opener.screenX + sx, opener.screenY + sy);
    }

    /* Find and focus the dialog's default button (OK), otherwise the focus
     * lands on the first focusable content - the homepage link. Links in XUL
     * look horrible when focused.
     */
    var binding = document.documentElement;
    var defaultButton = binding.getButton(binding.defaultButton);
    if (defaultButton)
        setTimeout(function() { defaultButton.focus() }, 0);
}

function onUnload()
{
    if (ownerClient)
        delete ownerClient.aboutDialog;
}

function copyVersion()
{
    var tr = Cc["@mozilla.org/widget/transferable;1"]
               .createInstance(Ci.nsITransferable);
    var str = Cc["@mozilla.org/supports-string;1"]
                .createInstance(Ci.nsISupportsString);

    tr.addDataFlavor("text/unicode");
    str.data = client.userAgent;
    tr.setTransferData("text/unicode", str, str.data.length * 2);
    Services.clipboard.setData(tr, null, Services.clipboard.kGlobalClipboard);
}

function openHomepage()
{
    if (ownerClient)
        ownerClient.dispatch("goto-url", {url: MSG_SOURCE_REPLY});
    else
        window.opener.open(MSG_SOURCE_REPLY, "_blank");
}
