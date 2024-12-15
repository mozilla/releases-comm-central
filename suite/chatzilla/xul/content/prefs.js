/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const DEFAULT_NICK = "IRCMonkey"

function initPrefs()
{
    function makeLogNameClient()
    {
        return makeLogName(client, "client");
    };

    client.prefManager = new PrefManager("extensions.irc.",
                                         client.defaultBundle);
    client.prefManagers = [client.prefManager];

    client.prefs = client.prefManager.prefs;

    let profilePath = Services.dirsvc.get("ProfD", Ci.nsIFile);
    profilePath.append("chatzilla");

    client.prefManager.addPref("profilePath", profilePath.path, null, null,
                                                                      "hidden");

    profilePath = new nsLocalFile(client.prefs["profilePath"]);

    if (!profilePath.exists())
        mkdir(profilePath);

    client.prefManager.profilePath = profilePath;

    var scriptPath = profilePath.clone();
    scriptPath.append("scripts");
    if (!scriptPath.exists())
        mkdir(scriptPath);

    var logPath = profilePath.clone();
    logPath.append("logs");
    if (!logPath.exists())
        mkdir(logPath);
    client.prefManager.logPath = logPath;

    var downloadsPath = profilePath.clone();
    downloadsPath.append("downloads");
    if (!downloadsPath.exists())
        mkdir(downloadsPath);

    var logDefault = client.prefManager.logPath.clone();
    logDefault.append(escapeFileName("client.log"));

    // Set up default nickname, if possible.
    var defaultNick = DEFAULT_NICK;
    let env = Cc["@mozilla.org/process/environment;1"]
                .getService(Ci.nsIEnvironment);
    /* Get the enviroment variables used by various OSes:
     *   USER     - Linux, macOS and other *nix-types.
     *   USERNAME - Windows.
     *   LOGNAME  - *nix again.
     */
    const vars = ["USER", "USERNAME", "LOGNAME"];

    for (let varName of vars)
    {
        let nick = env.get(varName);
        if (nick)
        {
            defaultNick = nick.replace(/ /g, "_");
            break;
        }
    }

    // Set a property so network ident prefs get the same group later:
    client.prefManager.identGroup = ".connect";
    // Linux and OS X won't let non-root listen on port 113.
    if ((client.platform == "Linux") || (client.platform == "Mac"))
        client.prefManager.identGroup = "hidden";

    var prefs =
        [
         ["activityFlashDelay", 200,      "hidden"],
         ["alert.overlapDelay", 50,       "hidden"],
         ["alert.floodDensity", 290,      "hidden"],
         ["alert.floodDispersion", 200,   "hidden"],
         ["alert.enabled",      true,     ".palert"],
         ["alert.globalEnabled", true,    "global.palertconfig"],
         ["alert.clickable",    true,     "hidden"],
         ["alert.nonFocusedOnly", true,   "global.palertconfig"],
         ["alert.channel.event", false,   ".palert"],
         ["alert.channel.chat", false,    ".palert"],
         ["alert.channel.stalk", true,    ".palert"],
         ["alert.user.chat",    true,     ".palert"],
         ["aliases",            [],       "lists.aliases"],
         ["autoAwayCap",        300,      "global"],
         ["autoAwayPeriod",     2,        "appearance.misc"],
         ["autoMarker",         false,    "appearance.misc"],
         ["autoperform.channel", [],      "lists.autoperform"],
         ["autoperform.client",  [],      "lists.autoperform"],
         ["autoperform.network", [],      "lists.autoperform"],
         ["autoperform.user",   ["whois"], "lists.autoperform"],
         ["autoRejoin",         false,    ".connect"],
         ["away",               "",       "hidden"],
         ["awayIdleMsg",        "",       ".ident"],
         ["awayIdleTime",       0,        ".ident"],
         ["awayNick",           "",       ".ident"],
         ["bugKeyword",         "bug",    "appearance.misc"],
         ["bugURL",           "https://bugzilla.mozilla.org/show_bug.cgi?id=%s",
                                          "appearance.misc"],
         ["bugURL.comment",     "#c%s",   "appearance.misc"],
         ["channelHeader",      true,     "global.header"],
         ["channelLog",         false,    "global.log"],
         ["channelMaxLines",    500,      "global.maxLines"],
         ["charset",            "utf-8",  ".connect"],
         ["clientMaxLines",     200,      "global.maxLines"],
         ["collapseActions",    true,     "appearance.misc"],
         ["collapseMsgs",       false,    "appearance.misc"],
         ["conference.limit",   150,      "appearance.misc"],
         ["connectTries",       -1,       ".connect"],
         ["copyMessages",       true,     "global"],
         ["dcc.autoAccept.delay", 10000,  "hidden"],
         ["dcc.downloadsFolder", getURLSpecFromFile(downloadsPath.path),
                                          "dcc"],
         ["dcc.enabled",        true,     "dcc"],
         ["dcc.listenPorts",    [],       "dcc.ports"],
         ["dcc.useServerIP",    true,     "dcc"],
         ["dccUserHeader",      true,     "global.header"],
         ["dccUserLog",         false,    "global.log"],
         ["dccUserMaxLines",    500,      "global.maxLines"],
         ["debugMode",          "",       "hidden"],
         ["defaultQuitMsg",     "",       ".connect"],
         ["deleteOnPart",       true,     "global"],
         ["desc",               "New Now Know How", ".ident"],
         ["displayHeader",      true,     "appearance.misc"],
         ["font.family",        "default", "appearance.misc"],
         ["font.size",          0,        "appearance.misc"],
         ["guessCommands",      true,     "hidden"],
         ["hasPrefs",           false,    "hidden"],
         ["identd.enabled",     false,    client.prefManager.identGroup],
         ["initialScripts",     ["scripts/"], "startup.initialScripts"],
         ["initialURLs",        [],       "startup.initialURLs"],
         ["inputSpellcheck",     true,    "global"],
         ["log",                false,
                                          ".log"],
         ["logFile.channel",    "$(network)/channels/$(channel).$y-$m-$d.log",
                                          "hidden"],
         ["logFile.client",     "client.$y-$m-$d.log",
                                          "hidden"],
         ["logFile.dccuser",    "dcc/$(user)/$(user).$y-$m-$d.log",
                                          "hidden"],
         ["logFile.network",    "$(network)/$(network).$y-$m-$d.log",
                                          "hidden"],
         ["logFile.user",       "$(network)/users/$(user).$y-$m-$d.log",
                                          "hidden"],
         ["logFileName",        makeLogNameClient,
                                          "hidden"],
         ["logFolder",          getURLSpecFromFile(logPath.path), ".log"],
         ["login.promptToSave", true,       "global.security"],
         ["motif.current",      "chrome://chatzilla/skin/output-light.css",
                                          "appearance.motif"],
         ["motif.dark",         "chrome://chatzilla/skin/output-dark.css",
                                          "appearance.motif"],
         ["motif.light",        "chrome://chatzilla/skin/output-light.css",
                                          "appearance.motif"],
         ["multiline",          false,    "hidden"],
         ["munger.bold",        true,     "munger"],
         ["munger.bugzilla-link", true,   "munger"],
         ["munger.channel-link",true,     "munger"],
         ["munger.colorCodes",  true,     "munger"],
         ["munger.ctrl-char",   true,     "munger"],
         ["munger.face",        true,     "munger"],
         ["munger.italic",      true,     "munger"],
         ["munger.link",        true,     "munger"],
         ["munger.mailto",      true,     "munger"],
         ["munger.quote",       true,     "munger"],
         ["munger.rheet",       true,     "munger"],
         ["munger.talkback-link", true,   "munger"],
         ["munger.teletype",    true,     "munger"],
         ["munger.underline",   true,     "munger"],
         ["munger.word-hyphenator", true, "munger"],
         ["networkHeader",      true,     "global.header"],
         ["networkLog",         false,    "global.log"],
         ["networkMaxLines",    200,      "global.maxLines"],
         ["newTabLimit",        30,       "global"],
         ["nickCompleteStr",    ":",      "global"],
         ["nickname",           defaultNick, ".ident"],
         ["nicknameList",       [],       "lists.nicknameList"],
         ["notify.aggressive",  true,     "global"],
         ["outgoing.colorCodes",  true,   "global"],
         ["outputWindowURL",   "chrome://chatzilla/content/output-window.html",
                                          "hidden"],
         ["proxy.typeOverride", "",       ".connect"],
         ["reconnect",          true,     ".connect"],
         ["sasl.plain.enabled", false,    ".ident"],
         ["showModeSymbols",    false,    "appearance.userlist"],
         ["sortUsersByMode",    true,     "appearance.userlist"],
         // Chat  == "Activity" activity.
         // Event == "Superfluous" activity.
         // Stalk == "Attention" activity.
         // Start == When view it opened.
         ["sound.channel.chat",  "",          ".soundEvts"],
         ["sound.channel.event", "",          ".soundEvts"],
         ["sound.channel.stalk", "beep",      ".soundEvts"],
         ["sound.channel.start", "",          ".soundEvts"],
         ["sound.enabled",       true,        "global.sounds"],
         ["sound.overlapDelay",  2000,        "global.sounds"],
         ["sound.user.stalk",    "beep",      ".soundEvts"],
         ["sound.user.start",    "beep beep", ".soundEvts"],
         ["stalkWholeWords",    true,     "lists.stalkWords"],
         ["stalkWords",         [],       "lists.stalkWords"],
         ["sts.enabled",        true,     ".connect"],
         ["tabLabel",           "",       "hidden"],
         ["tabGotoKeyModifiers", 0,       "hidden"],
         ["timestamps",         false,    "appearance.timestamps"],
         ["timestamps.display", "[%H:%M]", "appearance.timestamps"],
         ["timestamps.log",     "[%Y-%m-%d %H:%M:%S]", "hidden"],
         ["upgrade-insecure",   false,    ".connect"],
         ["urls.display",       10,       "hidden"],
         ["urls.store.max",     100,      "global"],
         ["userHeader",         true,     "global.header"],
         ["userlistLeft",       true,     "appearance.userlist"],
         ["userLog",            false,    "global.log"],
         ["userMaxLines",       200,      "global.maxLines"],
         ["usermode",           "+i",     ".ident"],
         ["username",           "chatzilla", ".ident"],
         ["warnOnClose",        true,     "global"]
        ];

    client.prefManager.addPrefs(prefs);
    client.prefManager.addObserver({ onPrefChanged: onPrefChanged });

    CIRCNetwork.prototype.stayingPower  = client.prefs["reconnect"];
    CIRCNetwork.prototype.MAX_CONNECT_ATTEMPTS = client.prefs["connectTries"];
    CIRCNetwork.prototype.INITIAL_NICK  = client.prefs["nickname"];
    CIRCNetwork.prototype.INITIAL_NAME  = client.prefs["username"];
    CIRCNetwork.prototype.INITIAL_DESC  = client.prefs["desc"];
    CIRCNetwork.prototype.INITIAL_UMODE = client.prefs["usermode"];
    CIRCNetwork.prototype.MAX_MESSAGES  = client.prefs["networkMaxLines"];
    CIRCNetwork.prototype.PROXY_TYPE_OVERRIDE = client.prefs["proxy.typeOverride"];
    CIRCNetwork.prototype.USE_SASL      = client.prefs["sasl.plain.enabled"];
    CIRCNetwork.prototype.UPGRADE_INSECURE = client.prefs["upgrade-insecure"];
    CIRCNetwork.prototype.STS_MODULE.ENABLED = client.prefs["sts.enabled"];
    CIRCChannel.prototype.MAX_MESSAGES  = client.prefs["channelMaxLines"];
    CIRCUser.prototype.MAX_MESSAGES     = client.prefs["userMaxLines"];
    CIRCDCCChat.prototype.MAX_MESSAGES  = client.prefs["dccUserMaxLines"];
    CIRCDCCFileTransfer.prototype.MAX_MESSAGES = client.prefs["dccUserMaxLines"];
    CIRCDCC.prototype.listenPorts       = client.prefs["dcc.listenPorts"];
    client.MAX_MESSAGES                 = client.prefs["clientMaxLines"];
    client.charset                      = client.prefs["charset"];

    initAliases();
}

function makeLogName(obj, type)
{
    /*  /\$\(([^)]+)\)|\$(\w)/g   *
     *       <----->     <-->     *
     *      longName   shortName  *
     */
    function replaceParam(match, longName, shortName)
    {
        if (typeof longName != "undefined" && longName)
        {
            // Remember to encode these, don't want some dodgy # breaking stuff.
            if (longName in longCodes)
                return encodeURIComponent(longCodes[longName]).toLowerCase();

            dd("Unknown long code: " + longName);
        }
        else if (typeof shortName != "undefined" && shortName)
        {
            if (shortName in shortCodes)
                return encodeURIComponent(shortCodes[shortName]).toLowerCase();

            dd("Unknown short code: " + shortName);
        }
        else
        {
            dd("Unknown match: " + match);
        }

        return match;
    };

    var base = client.prefs["logFolder"];
    var specific = client.prefs["logFile." + type];

    // Make sure we got ourselves a slash, or we'll be in trouble with the
    // concatenation.
    if (!base.match(/\/$/))
        base = base + "/";
    var file = base + specific;

    // Get details for $-replacement variables.
    var info = getObjectDetails(obj);

    // Store the most specific time short code on the object.
    obj.smallestLogInterval = "";
    if (file.indexOf("$y") != -1)
        obj.smallestLogInterval = "y";
    if (file.indexOf("$m") != -1)
        obj.smallestLogInterval = "m";
    if (file.indexOf("$d") != -1)
        obj.smallestLogInterval = "d";
    if (file.indexOf("$h") != -1)
        obj.smallestLogInterval = "h";

    // Three longs codes: $(network), $(channel) and $(user).
    // Each is available only if appropriate for the object.
    var longCodes = new Object();
    if (info.network)
        longCodes["network"] = info.network.unicodeName;
    if (info.channel)
        longCodes["channel"] = info.channel.unicodeName;
    if (info.user)
        longCodes["user"] = info.user.unicodeName;

    // 4 short codes: $y, $m, $d, $h.
    // These are time codes, each replaced with a fixed-length number.
    var d = new Date();
    var shortCodes = { y: padNumber(d.getFullYear(), 4),
                       m: padNumber(d.getMonth() + 1, 2),
                       d: padNumber(d.getDate(), 2),
                       h: padNumber(d.getHours(), 2)
                     };

    // Replace all $-variables in one go.
    file = file.replace(/\$\(([^)]+)\)|\$(\w)/g, replaceParam);

    // Convert from file: URL to local OS format.
    try
    {
        file = getFileFromURLSpec(file).path;
    }
    catch(ex)
    {
        dd("Error converting '" + base + specific + "' to a local file path.");
    }

    return file;
}

function pref_mungeName(name)
{
    var safeName = name.replace(/\./g, "-").replace(/:/g, "_").toLowerCase();
    return ecmaEscape(safeName);
}

function getNetworkPrefManager(network)
{
    function defer(prefName)
    {
        return client.prefs[prefName];
    };

    function makeLogNameNetwork()
    {
        return makeLogName(network, "network");
    };

    function onPrefChanged(prefName, newValue, oldValue)
    {
        onNetworkPrefChanged (network, prefName, newValue, oldValue);
    };

    var logDefault = client.prefManager.logPath.clone();
    logDefault.append(escapeFileName(pref_mungeName(network.encodedName)) + ".log");

    var prefs =
        [
         ["alert.enabled",      defer,     ".palert"],
         ["alert.channel.event",defer,     ".palert"],
         ["alert.channel.chat", defer,     ".palert"],
         ["alert.channel.stalk",defer,     ".palert"],
         ["alert.user.chat",    defer,     ".palert"],
         ["autoAwayPeriod",   defer, "appearance.misc"],
         ["autoMarker",       defer, "appearance.misc"],
         ["autoperform",      [],    "lists.autoperform"],
         ["autoRejoin",       defer, ".connect"],
         ["away",             defer, "hidden"],
         ["awayNick",         defer, ".ident"],
         ["bugURL",           defer, "appearance.misc"],
         ["bugURL.comment",   defer, "appearance.misc"],
         ["charset",          defer, ".connect"],
         ["collapseActions",  defer, "appearance.misc"],
         ["collapseMsgs",     defer, "appearance.misc"],
         ["conference.limit", defer, "appearance.misc"],
         ["connectTries",     defer, ".connect"],
         ["dcc.autoAccept.list", [], "dcc.autoAccept"],
         ["dcc.downloadsFolder", defer, "dcc"],
         ["dcc.useServerIP",  defer, "dcc"],
         ["defaultQuitMsg",   defer, ".connect"],
         ["desc",             defer, ".ident"],
         ["displayHeader",    client.prefs["networkHeader"], "appearance.misc"],
         ["font.family",      defer, "appearance.misc"],
         ["font.size",        defer, "appearance.misc"],
         ["hasPrefs",         false, "hidden"],
         ["identd.enabled",   defer, client.prefManager.identGroup],
         ["ignoreList",       [],    "hidden"],
         ["log",              client.prefs["networkLog"], ".log"],
         ["logFileName",      makeLogNameNetwork, "hidden"],
         ["motif.current",    defer, "appearance.motif"],
         ["nickname",         defer, ".ident"],
         ["nicknameList",     defer, "lists.nicknameList"],
         ["notifyList",       [],    "lists.notifyList"],
         ["outputWindowURL",  defer, "hidden"],
         ["proxy.typeOverride", defer, ".connect"],
         ["reconnect",        defer, ".connect"],
         ["sasl.plain.enabled",  defer, ".ident"],
         ["sound.channel.chat",  defer, ".soundEvts"],
         ["sound.channel.event", defer, ".soundEvts"],
         ["sound.channel.stalk", defer, ".soundEvts"],
         ["sound.channel.start", defer, ".soundEvts"],
         ["sound.user.stalk",    defer, ".soundEvts"],
         ["sound.user.start",    defer, ".soundEvts"],
         ["tabLabel",         "",     "hidden"],
         ["timestamps",         defer, "appearance.timestamps"],
         ["timestamps.display", defer, "appearance.timestamps"],
         ["timestamps.log",     defer, "hidden"],
         ["upgrade-insecure",   defer, ".connect"],
         ["usermode",         defer, ".ident"],
         ["username",         defer, ".ident"]
        ];

    var branch = "extensions.irc.networks." + pref_mungeName(network.encodedName) +
        ".";
    var prefManager = new PrefManager(branch, client.defaultBundle);
    prefManager.addPrefs(prefs);
    prefManager.addObserver({ onPrefChanged: onPrefChanged });
    client.prefManager.addObserver(prefManager);

    var value = prefManager.prefs["nickname"];
    if (value != CIRCNetwork.prototype.INITIAL_NICK)
        network.INITIAL_NICK = value;

    value = prefManager.prefs["username"];
    if (value != CIRCNetwork.prototype.INITIAL_NAME)
        network.INITIAL_NAME = value;

    value = prefManager.prefs["desc"];
    if (value != CIRCNetwork.prototype.INITIAL_DESC)
        network.INITIAL_DESC = value;

    value = prefManager.prefs["usermode"];
    if (value != CIRCNetwork.prototype.INITIAL_UMODE)
        network.INITIAL_UMODE = value;

    value = prefManager.prefs["proxy.typeOverride"];
    if (value != CIRCNetwork.prototype.PROXY_TYPE_OVERRIDE)
        network.PROXY_TYPE_OVERRIDE = value;

    value = prefManager.prefs["sasl.plain.enabled"];
    if (value != CIRCNetwork.prototype.USE_SASL)
        network.USE_SASL = value;

    value = prefManager.prefs["upgrade-insecure"];
    if (value != CIRCNetwork.prototype.UPGRADE_INSECURE)
        network.UPGRADE_INSECURE = value;

    network.stayingPower  = prefManager.prefs["reconnect"];
    network.MAX_CONNECT_ATTEMPTS = prefManager.prefs["connectTries"];

    client.prefManagers.push(prefManager);

    return prefManager;
}

function getChannelPrefManager(channel)
{
    var network = channel.parent.parent;

    function defer(prefName)
    {
        return network.prefs[prefName];
    };

    function makeLogNameChannel()
    {
        return makeLogName(channel, "channel");
    };

    function onPrefChanged(prefName, newValue, oldValue)
    {
        onChannelPrefChanged (channel, prefName, newValue, oldValue);
    };

    var logDefault = client.prefManager.logPath.clone();
    var filename = pref_mungeName(network.encodedName) + "," +
        pref_mungeName(channel.encodedName);

    logDefault.append(escapeFileName(filename) + ".log");

    var prefs =
        [
         ["alert.enabled",      defer,     ".palert"],
         ["alert.channel.event",defer,     ".palert"],
         ["alert.channel.chat", defer,     ".palert"],
         ["alert.channel.stalk",defer,     ".palert"],
         ["autoperform",      [],    "lists.autoperform"],
         ["autoRejoin",       defer, ".connect"],
         ["autoMarker",       defer, "appearance.misc"],
         ["bugURL",           defer, "appearance.misc"],
         ["bugURL.comment",   defer, "appearance.misc"],
         ["charset",          defer, ".connect"],
         ["collapseActions",  defer, "appearance.misc"],
         ["collapseMsgs",     defer, "appearance.misc"],
         ["conference.enabled", false, "hidden"],
         ["conference.limit", defer, "appearance.misc"],
         ["displayHeader",    client.prefs["channelHeader"], "appearance.misc"],
         ["font.family",      defer, "appearance.misc"],
         ["font.size",        defer, "appearance.misc"],
         ["hasPrefs",         false, "hidden"],
         ["log",              client.prefs["channelLog"], ".log"],
         ["logFileName",      makeLogNameChannel, "hidden"],
         ["motif.current",    defer, "appearance.motif"],
         ["outputWindowURL",  defer, "hidden"],
         ["sound.channel.chat",  defer, ".soundEvts"],
         ["sound.channel.event", defer, ".soundEvts"],
         ["sound.channel.stalk", defer, ".soundEvts"],
         ["sound.channel.start", defer, ".soundEvts"],
         ["tabLabel",         "",    "hidden"],
         ["timestamps",         defer, "appearance.timestamps"],
         ["timestamps.display", defer, "appearance.timestamps"],
         ["timestamps.log",     defer, "hidden"]
        ];

    var branch = "extensions.irc.networks." + pref_mungeName(network.encodedName) +
        ".channels." + pref_mungeName(channel.encodedName) + "."
    var prefManager = new PrefManager(branch, client.defaultBundle);
    prefManager.addPrefs(prefs);
    prefManager.addObserver({ onPrefChanged: onPrefChanged });
    network.prefManager.addObserver(prefManager);

    client.prefManagers.push(prefManager);

    return prefManager;
}

function getUserPrefManager(user)
{
    var network = user.parent.parent;

    function defer(prefName)
    {
        return network.prefs[prefName];
    };

    function makeLogNameUser()
    {
        return makeLogName(user, "user");
    };

    function onPrefChanged(prefName, newValue, oldValue)
    {
        onUserPrefChanged (user, prefName, newValue, oldValue);
    };

    var logDefault = client.prefManager.logPath.clone();
    var filename = pref_mungeName(network.encodedName);
    filename += "," + pref_mungeName(user.encodedName);
    logDefault.append(escapeFileName(filename) + ".log");

    var prefs =
        [
         ["alert.enabled",      defer,     ".palert"],
         ["alert.user.chat",    defer,     ".palert"],
         ["autoperform",      [],    "lists.autoperform"],
         ["charset",          defer, ".connect"],
         ["collapseActions",  defer, "appearance.misc"],
         ["collapseMsgs",     defer, "appearance.misc"],
         ["displayHeader",    client.prefs["userHeader"], "appearance.misc"],
         ["font.family",      defer, "appearance.misc"],
         ["font.size",        defer, "appearance.misc"],
         ["hasPrefs",         false, "hidden"],
         ["log",              client.prefs["userLog"], ".log"],
         ["logFileName",      makeLogNameUser, "hidden"],
         ["motif.current",    defer, "appearance.motif"],
         ["outputWindowURL",  defer, "hidden"],
         ["sound.user.stalk",    defer, ".soundEvts"],
         ["sound.user.start",    defer, ".soundEvts"],
         ["tabLabel",         "",    "hidden"],
         ["timestamps",         defer, "appearance.timestamps"],
         ["timestamps.display", defer, "appearance.timestamps"],
         ["timestamps.log",     defer, "hidden"]
        ];

    var branch = "extensions.irc.networks." + pref_mungeName(network.encodedName) +
        ".users." + pref_mungeName(user.encodedName) + ".";
    var prefManager = new PrefManager(branch, client.defaultBundle);
    prefManager.addPrefs(prefs);
    prefManager.addObserver({ onPrefChanged: onPrefChanged });
    network.prefManager.addObserver(prefManager);

    client.prefManagers.push(prefManager);

    return prefManager;
}

function getDCCUserPrefManager(user)
{
    function defer(prefName)
    {
        return client.prefs[prefName];
    };

    function makeLogNameUser()
    {
        return makeLogName(user, "dccuser");
    };

    function onPrefChanged(prefName, newValue, oldValue)
    {
        onDCCUserPrefChanged(user, prefName, newValue, oldValue);
    };

    var prefs =
        [
         ["alert.enabled",      defer,     ".palert"],
         ["alert.user.chat",    defer,     ".palert"],
         ["charset",          defer, ".connect"],
         ["collapseMsgs",     defer, "appearance.misc"],
         ["displayHeader",    client.prefs["dccUserHeader"], "appearance.misc"],
         ["font.family",      defer, "appearance.misc"],
         ["font.size",        defer, "appearance.misc"],
         ["hasPrefs",         false, "hidden"],
         ["log",              client.prefs["dccUserLog"], ".log"],
         ["logFileName",      makeLogNameUser, "hidden"],
         ["motif.current",    defer, "appearance.motif"],
         ["outputWindowURL",  defer, "hidden"],
         ["tabLabel",         "",    "hidden"],
         ["timestamps",         defer, "appearance.timestamps"],
         ["timestamps.display", defer, "appearance.timestamps"],
         ["timestamps.log",     defer, "hidden"]
        ];

    var branch = "extensions.irc.dcc.users." +
                 pref_mungeName(user.canonicalName) + ".";
    var prefManager = new PrefManager(branch, client.defaultBundle);
    prefManager.addPrefs(prefs);
    prefManager.addObserver({ onPrefChanged: onPrefChanged });
    client.prefManager.addObserver(prefManager);

    client.prefManagers.push(prefManager);

    return prefManager;
}

function destroyPrefs()
{
    if ("prefManagers" in client)
    {
        for (var i = 0; i < client.prefManagers.length; ++i)
            client.prefManagers[i].destroy();
        client.prefManagers = [];
    }
}

function onPrefChanged(prefName, newValue, oldValue)
{
    if (newValue == oldValue)
        return;

    switch (prefName)
    {
        case "awayIdleTime":
            uninitIdleAutoAway(oldValue);
            initIdleAutoAway(newValue);
            break;

        case "bugKeyword":
            client.munger.delRule("bugzilla-link");
            addBugzillaLinkMungerRule(newValue, 10, 10);
            break;

        case "channelMaxLines":
            CIRCChannel.prototype.MAX_MESSAGES = newValue;
            break;

        case "charset":
            client.charset = newValue;
            break;

        case "clientMaxLines":
            client.MAX_MESSAGES = newValue;
            break;

        case "connectTries":
            CIRCNetwork.prototype.MAX_CONNECT_ATTEMPTS = newValue;
            break;

        case "dcc.listenPorts":
            CIRCDCC.prototype.listenPorts = newValue;
            break;

        case "dccUserMaxLines":
            CIRCDCCFileTransfer.prototype.MAX_MESSAGES  = newValue;
            CIRCDCCChat.prototype.MAX_MESSAGES  = newValue;
            break;

        case "font.family":
        case "font.size":
            client.dispatch("sync-font");
            break;

        case "proxy.typeOverride":
            CIRCNetwork.prototype.PROXY_TYPE_OVERRIDE = newValue;
            break;

        case "reconnect":
            CIRCNetwork.prototype.stayingPower = newValue;
            break;

        case "showModeSymbols":
            if (newValue)
                setListMode("symbol");
            else
                setListMode("graphic");
            break;

        case "sasl.plain.enabled":
            CIRCNetwork.prototype.USE_SASL = newValue;
            break;

        case "upgrade-insecure":
            CIRCNetwork.prototype.UPGRADE_INSECURE = newValue;
            break;

        case "sts.enabled":
            CIRCNetwork.prototype.STS_MODULE.ENABLED = newValue;
            break;

        case "nickname":
            CIRCNetwork.prototype.INITIAL_NICK = newValue;
            break;

        case "username":
            CIRCNetwork.prototype.INITIAL_NAME = newValue;
            break;

        case "usermode":
            CIRCNetwork.prototype.INITIAL_UMODE = newValue;
            break;

        case "userMaxLines":
            CIRCUser.prototype.MAX_MESSAGES = newValue;
            break;

        case "userlistLeft":
            updateUserlistSide(newValue);
            break;

        case "debugMode":
            setDebugMode(newValue);
            break;

        case "desc":
            CIRCNetwork.prototype.INITIAL_DESC = newValue;
            break;

        case "stalkWholeWords":
        case "stalkWords":
            updateAllStalkExpressions();
            break;

        case "sortUsersByMode":
            if (client.currentObject.TYPE == "IRCChannel")
                client.currentObject.updateUserList(true);

        case "motif.current":
            client.dispatch("sync-motif");
            break;

        case "multiline":
            multilineInputMode(newValue);
            delete client.multiLineForPaste;
            break;

        case "munger.colorCodes":
            client.enableColors = newValue;
            break;

        case "networkMaxLines":
            CIRCNetwork.prototype.MAX_MESSAGES = newValue;
            break;

        case "outputWindowURL":
            client.dispatch("sync-window");
            break;

        case "displayHeader":
            client.dispatch("sync-header");
            break;

        case "tabLabel":
            onTabLabelUpdate(client, newValue);
            break;

        case "timestamps":
        case "timestamps.display":
        case "collapseActions":
        case "collapseMsgs":
            client.dispatch("sync-timestamp");
            break;

        case "log":
            client.dispatch("sync-log");
            break;

        case "alert.globalEnabled":
            updateAlertIcon(false);
            break;

        case "alert.floodDensity":
            if (client.alert && client.alert.floodProtector)
                client.alert.floodProtector.floodDensity = newValue;
            break;

        case "alert.floodDispersion":
            if (client.alert && client.alert.floodProtector)
                client.alert.floodProtector.floodDispersion = newValue;
            break;

        case "aliases":
            updateAliases();
            break;

        case "inputSpellcheck":
            updateSpellcheck(newValue);
            break;

        case "urls.store.max":
            if (client.urlLogger)
            {
                client.urlLogger.autoLimit = newValue;
                client.urlLogger.limit(newValue);
            }
            break;

        default:
            // Make munger prefs apply without a restart
            var m, rule;
            if ((m = prefName.match(/^munger\.(\S+)$/)) &&
                (rule = client.munger.getRule(m[1])))
            {
                rule.enabled = newValue;
            }
    }
}

function onNetworkPrefChanged(network, prefName, newValue, oldValue)
{
    if (network != client.networks[network.collectionKey])
    {
        /* this is a stale observer, remove it */
        network.prefManager.destroy();
        return;
    }

    if (newValue == oldValue)
        return;

    network.updateHeader();

    switch (prefName)
    {
        case "nickname":
            network.INITIAL_NICK = newValue;
            break;

        case "username":
            network.INITIAL_NAME = newValue;
            break;

        case "usermode":
            network.INITIAL_UMODE = newValue;
            if (network.isConnected())
            {
                network.primServ.sendData("mode " + network.server.me + " :" +
                                          newValue + "\n");
            }
            break;

        case "desc":
            network.INITIAL_DESC = newValue;
            break;

        case "proxy.typeOverride":
            network.PROXY_TYPE_OVERRIDE = newValue;
            break;

        case "reconnect":
            network.stayingPower = newValue;
            break;

        case "font.family":
        case "font.size":
            network.dispatch("sync-font");
            break;

        case "motif.current":
            network.dispatch("sync-motif");
            break;

        case "notifyList":
            if (!network.primServ.supports["monitor"])
                break;
            var adds = newValue.filter((el) =>
                { return oldValue.indexOf(el) < 0; });
            var subs = oldValue.filter((el) =>
                { return newValue.indexOf(el) < 0; });
            if (adds.length > 0)
                network.primServ.sendMonitorList(adds, true);
            if (subs.length > 0)
                network.primServ.sendMonitorList(subs, false);
            break;

        case "outputWindowURL":
            network.dispatch("sync-window");
            break;

        case "displayHeader":
            network.dispatch("sync-header");
            break;

        case "tabLabel":
            onTabLabelUpdate(network, newValue);
            break;

        case "timestamps":
        case "timestamps.display":
        case "collapseActions":
        case "collapseMsgs":
            network.dispatch("sync-timestamp");
            break;

        case "log":
            network.dispatch("sync-log");
            break;

        case "connectTries":
            network.MAX_CONNECT_ATTEMPTS = newValue;
            break;

        case "sasl.plain.enabled":
            network.USE_SASL = newValue;
            break;

        case "upgrade-insecure":
            network.UPGRADE_INSECURE = newValue;
            break;
    }
}

function onChannelPrefChanged(channel, prefName, newValue, oldValue)
{
    var network = channel.parent.parent;

    if (network != client.networks[network.collectionKey] ||
        channel.parent != network.primServ ||
        channel != network.primServ.channels[channel.collectionKey])
    {
        /* this is a stale observer, remove it */
        channel.prefManager.destroy();
        return;
    }

    if (newValue == oldValue)
        return;

    channel.updateHeader();

    switch (prefName)
    {
        case "conference.enabled":
            // Wouldn't want to display a message to a hidden view.
            if ("messages" in channel)
            {
                if (newValue)
                    channel.display(MSG_CONF_MODE_ON);
                else
                    channel.display(MSG_CONF_MODE_OFF);
            }
            break;

        case "conference.limit":
            channel._updateConferenceMode();
            break;

        case "font.family":
        case "font.size":
            channel.dispatch("sync-font");
            break;

        case "motif.current":
            channel.dispatch("sync-motif");
            break;

        case "outputWindowURL":
            channel.dispatch("sync-window");
            break;

        case "displayHeader":
            channel.dispatch("sync-header");
            break;

        case "tabLabel":
            onTabLabelUpdate(channel, newValue);
            break;

        case "timestamps":
        case "timestamps.display":
        case "collapseActions":
        case "collapseMsgs":
            channel.dispatch("sync-timestamp");
            break;

        case "log":
            channel.dispatch("sync-log");
            break;
    }
}

function onUserPrefChanged(user, prefName, newValue, oldValue)
{
    var network = user.parent.parent;

    if (network != client.networks[network.collectionKey] ||
        user.parent != network.primServ ||
        user != network.primServ.users[user.collectionKey])
    {
        /* this is a stale observer, remove it */
        user.prefManager.destroy();
        return;
    }

    if (newValue == oldValue)
        return;

    user.updateHeader();

    switch (prefName)
    {
        case "font.family":
        case "font.size":
            user.dispatch("sync-font");
            break;

        case "motif.current":
            user.dispatch("sync-motif");
            break;

        case "outputWindowURL":
            user.dispatch("sync-window");
            break;

        case "displayHeader":
            user.dispatch("sync-header");
            break;

        case "tabLabel":
            onTabLabelUpdate(user, newValue);
            break;

        case "timestamps":
        case "timestamps.display":
        case "collapseActions":
        case "collapseMsgs":
            user.dispatch("sync-timestamp");
            break;

        case "log":
            user.dispatch("sync-log");
            break;
    }
}

function onDCCUserPrefChanged(user, prefName, newValue, oldValue)
{
    if (client.dcc.users[user.key] != user)
    {
        /* this is a stale observer, remove it */
        user.prefManager.destroy();
        return;
    }

    if (newValue == oldValue)
        return;

    // DCC Users are a pain, they can have multiple views!
    function updateDCCView(view)
    {
        switch (prefName)
        {
            case "font.family":
            case "font.size":
                view.dispatch("sync-font");
                break;

            case "motif.current":
                view.dispatch("sync-motif");
                break;

            case "outputWindowURL":
                view.dispatch("sync-window");
                break;

            case "displayHeader":
                view.dispatch("sync-header");
                break;

            case "tabLabel":
                onTabLabelUpdate(user, newValue);
                break;

            case "timestamps":
            case "timestamps.display":
            case "collapseActions":
            case "collapseMsgs":
                view.dispatch("sync-timestamp");
                break;

            case "log":
                view.dispatch("sync-log");
                break;
        }
    };

    for (var i = 0; client.dcc.chats.length; i++)
    {
        var chat = client.dcc.chats[i];
        if (chat.user == user)
            updateDCCView(chat);
    }
}

function initAliases()
{
    client.commandManager.aliasList = new Object();
    updateAliases();
}

function updateAliases()
{
    var aliasDefs = client.prefs["aliases"];

    // Flag all aliases as 'removed' first.
    for (var name in client.commandManager.aliasList)
        client.commandManager.aliasList[name] = false;

    for (var i = 0; i < aliasDefs.length; ++i)
    {
        var ary = aliasDefs[i].match(/^(.*?)\s*=\s*(.*)$/);
        if (ary)
        {
            var name = ary[1];
            var list = ary[2];

            // Remove the alias, if it exists, or we'll keep stacking them.
            if (name in client.commandManager.aliasList)
                client.commandManager.removeCommand({name: name});
            client.commandManager.defineCommand(name, list);
            // Flag this alias as 'used'.
            client.commandManager.aliasList[name] = true;
        }
        else
        {
            dd("Malformed alias: " + aliasDefs[i]);
        }
    }

    // Purge any aliases that were defined but are no longer in the pref.
    for (var name in client.commandManager.aliasList)
    {
        if (!client.commandManager.aliasList[name])
        {
            client.commandManager.removeCommand({name: name});
            delete client.commandManager.aliasList[name];
        }
    }
}

function onTabLabelUpdate(sourceObject, newValue)
{
    var tab = getTabForObject(sourceObject);
    if (tab)
    {
        tab.label = newValue || sourceObject.viewName;
        tab.setAttribute("tooltiptext", sourceObject.viewName);
    }
}

