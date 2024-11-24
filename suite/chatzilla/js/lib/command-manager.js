/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @internal
function getAccessKey(str)
{
    var i = str.indexOf("&");
    if (i == -1)
        return "";
    return str[i + 1];
}

function objectContains(o, p)
{
    return Object.hasOwnProperty.call(o, p);
}

// @internal
function CommandRecord(name, func, usage, help, label, accesskey, flags,
                       keystr, tip, format, helpUsage)
{
    this.name = name;
    this.func = func;
    this._usage = usage;
    this.scanUsage();
    this.help = help;
    this.label = label ? label : name;
    this.accesskey = accesskey ? accesskey : "";
    this.format = format;
    this.helpUsage = helpUsage;
    this.labelstr = label.replace ("&", "");
    this.tip = tip;
    this.flags = flags;
    this._enabled = true;
    this.keyNodes = new Array();
    this.keystr = keystr;
    this.uiElements = new Array();
}

CommandRecord.prototype.__defineGetter__ ("enabled", cr_getenable);
function cr_getenable ()
{
    return this._enabled;
}

CommandRecord.prototype.__defineSetter__ ("enabled", cr_setenable);
function cr_setenable (state)
{
    for (var i = 0; i < this.uiElements.length; ++i)
    {
        if (state)
            this.uiElements[i].removeAttribute ("disabled");
        else
            this.uiElements[i].setAttribute ("disabled", "true");
    }
    return (this._enabled = state);
}

CommandRecord.prototype.__defineSetter__ ("usage", cr_setusage);
function cr_setusage (usage)
{
    this._usage = usage;
    this.scanUsage();
}

CommandRecord.prototype.__defineGetter__ ("usage", cr_getusage);
function cr_getusage()
{
    return this._usage;
}

/**
 * @internal
 *
 * Scans the argument spec, in the format "<a1> <a2> [<o1> <o2>]", into an
 * array of strings.
 */
CommandRecord.prototype.scanUsage =
function cr_scanusage()
{
    var spec = this._usage;
    var currentName = "";
    var inName = false;
    var len = spec.length;
    var capNext = false;

    this._usage = spec;
    this.argNames = new Array();

    for (var i = 0; i < len; ++i)
    {
        switch (spec[i])
        {
            case '[':
                this.argNames.push (":");
                break;

            case '<':
                inName = true;
                break;

            case '-':
                capNext = true;
                break;

            case '>':
                inName = false;
                this.argNames.push (currentName);
                currentName = "";
                capNext = false;
                break;

            default:
                if (inName)
                    currentName += capNext ? spec[i].toUpperCase() : spec[i];
                capNext = false;
                break;
        }
    }
}

/**
 * Manages commands, with accelerator keys, help text and argument processing.
 *
 * You should never need to create an instance of this prototype; access the
 * command manager through |client.commandManager|.
 *
 * @param defaultBundle An |nsIStringBundle| object to load command parameters,
 *                      labels a help text from.
 */
function CommandManager(defaultBundle)
{
    this.commands = new Object();
    this.commandHistory = new Object();
    this.defaultBundle = defaultBundle;
    this.currentDispatchDepth = 0;
    this.maxDispatchDepth = 10;
    this.dispatchUnwinding = false;
}

// @undocumented
CommandManager.prototype.defaultFlags = 0;

/**
 * Adds multiple commands in a single call.
 *
 * @param cmdary |Array| containing commands to define; each item in the |Array|
 *               is also an |Array|, with either 3 or 4 items - corresponding to
 *               the first three or four arguments of |defineCommand|. An extra
 *               property, |stringBundle|, may be set on the |cmdary| |Array|
 *               to override the |defaultBundle| for all the commands.
 */
CommandManager.prototype.defineCommands =
function cmgr_defcmds(cmdary)
{
    var len = cmdary.length;
    var commands = new Object();
    var bundle = "stringBundle" in cmdary ? cmdary.stringBundle : null;

    for (var i = 0; i < len; ++i)
    {
        let name  = cmdary[i][0];
        let func  = cmdary[i][1];
        let flags = cmdary[i][2];
        let usage = (3 in cmdary[i]) ? cmdary[i][3] : "";
        commands[name] = this.defineCommand(name, func, flags, usage, bundle);
    }

    return commands;
}

/**
 * Adds a single command.
 *
 * @param name The |String| name of the command to define.
 * @param func A |Function| to call to handle dispatch of the new command.
 * @param flags Optional. A |Number| indicating any special requirements for the
 *              command.
 * @param usage Optional. A |String| specifying the arguments to the command. If
 *              not specified, then it is assumed there are none.
 * @param bundle Optional. An |nsIStringBundle| to fetch parameters, labels,
 *               accelerator keys and help from. If not specified, the
 *               |defaultBundle| is used.
 */
CommandManager.prototype.defineCommand =
function cmdmgr_defcmd(name, func, flags, usage, bundle)
{
    if (!bundle)
        bundle = this.defaultBundle;

    var helpDefault = MSG_NO_HELP;
    var labelDefault = name;
    var aliasFor;

    if (typeof flags != "number")
        flags = this.defaultFlags;

    if (typeof usage != "string")
        usage = "";

    if (typeof func == "string")
    {
        var ary = func.match(/(\S+)/);
        if (ary)
            aliasFor = ary[1];
        else
            aliasFor = null;
        helpDefault = getMsg (MSG_DEFAULT_ALIAS_HELP, func);
        if (aliasFor)
            labelDefault = getMsgFrom (bundle, "cmd." + aliasFor + ".label",
                                       null, name);
    }

    var label = getMsgFrom(bundle, "cmd." + name + ".label", null,
                           labelDefault);
    var accesskey = getMsgFrom(bundle, "cmd." + name + ".accesskey", null,
                               getAccessKey(label));
    var help = helpDefault;
    var helpUsage = "";
    // Help is only shown for commands that available from the console.
    if (flags & CMD_CONSOLE)
    {
        help = getMsgFrom(bundle, "cmd." + name + ".help", null, helpDefault);
        // Only need to lookup localized helpUsage for commands that have them.
        if (usage)
        {
            helpUsage = getMsgFrom(bundle, "cmd." + name + ".helpUsage", null,
                                   "");
        }
    }
    var keystr = getMsgFrom (bundle, "cmd." + name + ".key", null, "");
    var format = getMsgFrom (bundle, "cmd." + name + ".format", null, null);
    var tip = getMsgFrom (bundle, "cmd." + name + ".tip", null, "");
    var command = new CommandRecord(name, func, usage, help, label, accesskey,
                                    flags, keystr, tip, format, helpUsage);
    this.addCommand(command);
    if (aliasFor)
        command.aliasFor = aliasFor;

    return command;
}

/**
 * Installs accelerator keys for commands into an existing document.
 *
 * @internal
 * @param document An |XULDocument| within which to install the accelerator
 *                 keys. Each command's key is installed by |installKey|.
 * @param commands Optional. An |Array| or |Object| continaing |CommandRecord|
 *                 objects. If not specified, all commands in the
 *                 |CommandManager| are installed.
 */
CommandManager.prototype.installKeys =
function cmgr_instkeys(document, commands)
{
    var parentElem = document.getElementById("dynamic-keys");
    if (!parentElem)
    {
        parentElem = document.createElement("keyset");
        parentElem.setAttribute("id", "dynamic-keys");
        document.documentElement.appendChild(parentElem);
    }

    if (!commands)
        commands = this.commands;

    for (var c in commands)
        this.installKey (parentElem, commands[c]);
}

/**
 * Installs the accelerator key for a single command.
 *
 * This creates a <key> XUL element inside |parentElem|.  It should usually be
 * called once per command, per document, so that accelerator keys work in all
 * application windows.
 *
 * @internal
 * @param parentElem An |XULElement| to add the <key> too.
 * @param command    The |CommandRecord| to install.
 */
CommandManager.prototype.installKey =
function cmgr_instkey(parentElem, command)
{
    if (!command.keystr)
        return;

    var ary = command.keystr.match (/(.*\s)?([\S]+)$/);
    if (!ASSERT(ary, "couldn't parse key string ``" + command.keystr +
                "'' for command ``" + command.name + "''"))
    {
        return;
    }

    var key = document.createElement ("key");
    key.setAttribute ("id", "key:" + command.name);
    key.setAttribute ("oncommand", "dispatch('" + command.name +
                      "', {isInteractive: true, source: 'keyboard'});");

    if (ary[1])
        key.setAttribute ("modifiers", ary[1]);

    if (ary[2].indexOf("VK_") == 0)
        key.setAttribute ("keycode", ary[2]);
    else
        key.setAttribute ("key", ary[2]);

    parentElem.appendChild(key);
    command.keyNodes.push(key);
}

/**
 * Uninstalls accelerator keys for commands from a document.
 *
 * @internal
 * @param commands Optional. An |Array| or |Object| continaing |CommandRecord|
 *                 objects. If not specified, all commands in the
 *                 |CommandManager| are uninstalled.
 */
CommandManager.prototype.uninstallKeys =
function cmgr_uninstkeys(commands)
{
    if (!commands)
        commands = this.commands;

    for (var c in commands)
        this.uninstallKey (commands[c]);
}

/**
 * Uninstalls the accelerator key for a single command.
 *
 * @internal
 * @param command    The |CommandRecord| to uninstall.
 */
CommandManager.prototype.uninstallKey =
function cmgr_uninstkey(command)
{
    for (var i in command.keyNodes)
    {
        try
        {
            /* document may no longer exist in a useful state. */
            command.keyNodes[i].parentNode.removeChild(command.keyNodes[i]);
        }
        catch (ex)
        {
            dd ("*** caught exception uninstalling key node: " + ex);
        }
    }
}

/**
 * Use |defineCommand|.
 *
 * @internal
 * @param command The |CommandRecord| to add to the |CommandManager|.
 */
CommandManager.prototype.addCommand =
function cmgr_add(command)
{
    if (objectContains(this.commands, command.name))
    {
        /* We've already got a command with this name - invoke the history
         * storage so that we can undo this back to its original state.
         */
        if (!objectContains(this.commandHistory, command.name))
            this.commandHistory[command.name] = new Array();
        this.commandHistory[command.name].push(this.commands[command.name]);
    }
    this.commands[command.name] = command;
}

/**
 * Removes multiple commands in a single call.
 *
 * @param cmdary An |Array| or |Object| containing |CommandRecord| objects.
 *               Ideally use the value returned from |defineCommands|.
 */
CommandManager.prototype.removeCommands =
function cmgr_removes(cmdary)
{
    for (var i in cmdary)
    {
        var command = isinstance(cmdary[i], Array) ?
            {name: cmdary[i][0]} : cmdary[i];
        this.removeCommand(command);
    }
}

/**
 * Removes a single command.
 *
 * @param command The |CommandRecord| to remove from the |CommandManager|.
 *                Ideally use the value returned from |defineCommand|.
 */
CommandManager.prototype.removeCommand =
function cmgr_remove(command)
{
    delete this.commands[command.name];
    if (objectContains(this.commandHistory, command.name))
    {
        /* There was a previous command with this name - restore the most
         * recent from the history, returning the command to its former glory.
         */
        this.commands[command.name] = this.commandHistory[command.name].pop();
        if (this.commandHistory[command.name].length == 0)
            delete this.commandHistory[command.name];
    }
}

/**
 * Registers a hook for a particular command.
 *
 * A command hook is uniquely identified by the pair |id|, |before|; only a
 * single hook may exist for a given pair of |id| and |before| values. It is
 * wise to use a unique |id|; plugins should construct an |id| using
 * |plugin.id|, e.g. |plugin.id + "-my-hook-1"|.
 *
 * @param commandName A |String| command name to hook. The command named must
 *                    already exist in the |CommandManager|; if it does not, no
 *                    hook is added.
 * @param func        A |Function| to handle the hook.
 * @param id          A |String| identifier for the hook.
 * @param before      A |Boolean| indicating whether the hook wishes to be
 *                    called before or after the command executes.
 */
CommandManager.prototype.addHook =
function cmgr_hook (commandName, func, id, before)
{
    if (!ASSERT(objectContains(this.commands, commandName),
                "Unknown command '" + commandName + "'"))
    {
        return;
    }

    var command = this.commands[commandName];

    if (before)
    {
        if (!("beforeHooks" in command))
            command.beforeHooks = new Object();
        command.beforeHooks[id] = func;
    }
    else
    {
        if (!("afterHooks" in command))
            command.afterHooks = new Object();
        command.afterHooks[id] = func;
    }
}

/**
 * Registers multiple hooks for commands.
 *
 * @param hooks An |Object| containing |Function| objects to call for each
 *              hook; the key of each item is the name of the command it
 *              wishes to hook. Optionally, the |_before| property can be
 *              added to a |function| to override the default |before| value
 *              of |false|.
 * @param prefix Optional. A |String| prefix to apply to each hook's command
 *               name to compute an |id| for it.
 */
CommandManager.prototype.addHooks =
function cmgr_hooks (hooks, prefix)
{
    if (!prefix)
        prefix = "";

    for (var h in hooks)
    {
        this.addHook(h, hooks[h], prefix + ":" + h,
                     ("_before" in hooks[h]) ? hooks[h]._before : false);
    }
}

/**
 * Unregisters multiple hooks for commands.
 *
 * @param hooks An |Object| identical to the one passed to |addHooks|.
 * @param prefix Optional. A |String| identical to the one passed to |addHooks|.
 */
CommandManager.prototype.removeHooks =
function cmgr_remhooks (hooks, prefix)
{
    if (!prefix)
        prefix = "";

    for (var h in hooks)
    {
        this.removeHook(h, prefix + ":" + h,
                        ("before" in hooks[h]) ? hooks[h].before : false);
    }
}

/**
 * Unregisters a hook for a particular command.
 *
 * The arguments to |removeHook| are the same as |addHook|, but without the
 * hook function itself.
 *
 * @param commandName The |String| command name to unhook.
 * @param id          The |String| identifier for the hook.
 * @param before      A |Boolean| indicating whether the hook was to be
 *                    called before or after the command executed.
 */
CommandManager.prototype.removeHook =
function cmgr_unhook (commandName, id, before)
{
    var command = this.commands[commandName];

    if (before)
        delete command.beforeHooks[id];
    else
        delete command.afterHooks[id];
}

/**
 * Gets a sorted |Array| of |CommandRecord| objects which match.
 *
 * After filtering by |flags| (if specified), if an exact match for
 * |partialName| is found, only that is returned; otherwise, all commands
 * starting with |partialName| are returned in alphabetical order by |label|.
 *
 * @param partialName Optional. A |String| prefix to search for.
 * @param flags Optional. Flags to logically AND with commands.
 */
CommandManager.prototype.list =
function cmgr_list(partialName, flags, exact)
{
    /* returns array of command objects which look like |partialName|, or
     * all commands if |partialName| is not specified */
    function compare (a, b)
    {
        a = a.labelstr.toLowerCase();
        b = b.labelstr.toLowerCase();

        if (a == b)
            return 0;

        if (a > b)
            return 1;

        return -1;
    }

    var ary = new Array();
    var commandNames = Object.keys(this.commands);

    for (var name of commandNames)
    {
        let command = this.commands[name];
        if ((!flags || (command.flags & flags)) &&
            (!partialName || command.name.startsWith(partialName)))
        {
            if (exact && partialName &&
                partialName.length == command.name.length)
            {
                /* exact match */
                return [command];
            }
            ary.push(command);
        }
    }

    ary.sort(compare);
    return ary;
}

/**
 * Gets a sorted |Array| of command names which match.
 *
 * |listNames| operates identically to |list|, except that only command names
 * are returned, not |CommandRecord| objects.
 */
CommandManager.prototype.listNames =
function cmgr_listnames (partialName, flags)
{
    var cmds = this.list(partialName, flags, false);
    var cmdNames = new Array();

    for (var c in cmds)
        cmdNames.push (cmds[c].name);

    cmdNames.sort();
    return cmdNames;
}

/**
 * Internal use only.
 *
 * Called to parse the arguments stored in |e.inputData|, as properties of |e|,
 * for the CommandRecord stored on |e.command|.
 *
 * @params e  Event object to be processed.
 */
// @undocumented
CommandManager.prototype.parseArguments =
function cmgr_parseargs (e)
{
    var rv = this.parseArgumentsRaw(e);
    //dd("parseArguments '" + e.command.usage + "' " +
    //   (rv ? "passed" : "failed") + "\n" + dumpObjectTree(e));
    delete e.currentArgIndex;
    return rv;
}

/**
 * Internal use only.
 *
 * Don't call parseArgumentsRaw directly, use parseArguments instead.
 *
 * Parses the arguments stored in the |inputData| property of the event object,
 * according to the format specified by the |command| property.
 *
 * On success this method returns true, and propery names corresponding to the
 * argument names used in the format spec will be created on the event object.
 * All optional parameters will be initialized to |null| if not already present
 * on the event.
 *
 * On failure this method returns false and a description of the problem
 * will be stored in the |parseError| property of the event.
 *
 * For example...
 * Given the argument spec "<int> <word> [ <word2> <word3> ]", and given the
 * input string "411 foo", stored as |e.command.usage| and |e.inputData|
 * respectively, this method would add the following propertys to the event
 * object...
 *   -name---value--notes-
 *   e.int    411   Parsed as an integer
 *   e.word   foo   Parsed as a string
 *   e.word2  null  Optional parameters not specified will be set to null.
 *   e.word3  null  If word2 had been provided, word3 would be required too.
 *
 * Each parameter is parsed by calling the function with the same name, located
 * in this.argTypes.  The first parameter is parsed by calling the function
 * this.argTypes["int"], for example.  This function is expected to act on
 * e.unparsedData, taking it's chunk, and leaving the rest of the string.
 * The default parse functions are...
 *   <word>    parses contiguous non-space characters.
 *   <int>     parses as an int.
 *   <rest>    parses to the end of input data.
 *   <state>   parses yes, on, true, 1, 0, false, off, no as a boolean.
 *   <toggle>  parses like a <state>, except allows "toggle" as well.
 *   <...>     parses according to the parameter type before it, until the end
 *             of the input data.  Results are stored in an array named
 *             paramnameList, where paramname is the name of the parameter
 *             before <...>.  The value of the parameter before this will be
 *             paramnameList[0].
 *
 * If there is no parse function for an argument type, "word" will be used by
 * default.  You can alias argument types with code like...
 * commandManager.argTypes["my-integer-name"] = commandManager.argTypes["int"];
 */
// @undocumented
CommandManager.prototype.parseArgumentsRaw =
function parse_parseargsraw (e)
{
    var argc = e.command.argNames.length;

    function initOptionals()
    {
        for (var i = 0; i < argc; ++i)
        {
            if (e.command.argNames[i] != ":" &&
                e.command.argNames[i] != "..."  &&
                !(e.command.argNames[i] in e))
            {
                e[e.command.argNames[i]] = null;
            }

            if (e.command.argNames[i] == "...")
            {
                var paramName = e.command.argNames[i - 1];
                if (paramName == ":")
                    paramName = e.command.argNames[i - 2];
                var listName = paramName + "List";
                if (!(listName in e))
                    e[listName] = [ e[paramName] ];
            }
        }
    }

    if ("inputData" in e && e.inputData)
    {
        /* if data has been provided, parse it */
        e.unparsedData = e.inputData;
        var parseResult;
        var currentArg;
        e.currentArgIndex = 0;

        if (argc)
        {
            currentArg = e.command.argNames[e.currentArgIndex];

            while (e.unparsedData)
            {
                if (currentArg != ":")
                {
                    if (!this.parseArgument (e, currentArg))
                        return false;
                }
                if (++e.currentArgIndex < argc)
                    currentArg = e.command.argNames[e.currentArgIndex];
                else
                    break;
            }

            if (e.currentArgIndex < argc && currentArg != ":")
            {
                /* parse loop completed because it ran out of data.  We haven't
                 * parsed all of the declared arguments, and we're not stopped
                 * at an optional marker, so we must be missing something
                 * required... */
                e.parseError = getMsg(MSG_ERR_REQUIRED_PARAM,
                                      e.command.argNames[e.currentArgIndex]);
                return false;
            }
        }

        if (e.unparsedData)
        {
            /* parse loop completed with unparsed data, which means we've
             * successfully parsed all arguments declared.  Whine about the
             * extra data... */
            display (getMsg(MSG_EXTRA_PARAMS, e.unparsedData), MT_WARN);
        }
    }

    var rv = this.isCommandSatisfied(e);
    if (rv)
        initOptionals();
    return rv;
}

/**
 * Returns true if |e| has the properties required to call the command
 * |command|.
 *
 * If |command| is not provided, |e.command| is used instead.
 *
 * @param e        Event object to test against the command.
 * @param command  Command to test.
 */
// @undocumented
CommandManager.prototype.isCommandSatisfied =
function cmgr_isok (e, command)
{
    if (typeof command == "undefined")
        command = e.command;
    else if (typeof command == "string")
        command = this.commands[command];

    if (!command.enabled)
        return false;

    for (var i = 0; i < command.argNames.length; ++i)
    {
        if (command.argNames[i] == ":")
             return true;

        if (!(command.argNames[i] in e))
        {
            e.parseError = getMsg(MSG_ERR_REQUIRED_PARAM, command.argNames[i]);
            //dd("command '" + command.name + "' unsatisfied: " + e.parseError);
            return false;
        }
    }

    //dd ("command '" + command.name + "' satisfied.");
    return true;
}

/**
 * Internal use only.
 * See parseArguments above and the |argTypes| object below.
 *
 * Parses the next argument by calling an appropriate parser function, or the
 * generic "word" parser if none other is found.
 *
 * @param e     event object.
 * @param name  property name to use for the parse result.
 */
// @undocumented
CommandManager.prototype.parseArgument =
function cmgr_parsearg (e, name)
{
    var parseResult;

    if (name in this.argTypes)
        parseResult = this.argTypes[name](e, name, this);
    else
        parseResult = this.argTypes["word"](e, name, this);

    if (!parseResult)
        e.parseError = getMsg(MSG_ERR_INVALID_PARAM,
                              [name, e.unparsedData]);

    return parseResult;
}

// @undocumented
CommandManager.prototype.argTypes = new Object();

/**
 * Convenience function used to map a list of new types to an existing parse
 * function.
 */
// @undocumented
CommandManager.prototype.argTypes.__aliasTypes__ =
function at_alias (list, type)
{
    for (var i in list)
    {
        this[list[i]] = this[type];
    }
}

/**
 * Internal use only.
 *
 * Parses an integer, stores result in |e[name]|.
 */
// @undocumented
CommandManager.prototype.argTypes["int"] =
function parse_int (e, name)
{
    var ary = e.unparsedData.match (/(\d+)(?:\s+(.*))?$/);
    if (!ary)
        return false;
    e[name] = Number(ary[1]);
    e.unparsedData = arrayHasElementAt(ary, 2) ? ary[2] : "";
    return true;
}

/**
 * Internal use only.
 *
 * Parses a word, which is defined as a list of nonspace characters.
 *
 * Stores result in |e[name]|.
 */
// @undocumented
CommandManager.prototype.argTypes["word"] =
function parse_word (e, name)
{
    var ary = e.unparsedData.match (/(\S+)(?:\s+(.*))?$/);
    if (!ary)
        return false;
    e[name] = ary[1];
    e.unparsedData = arrayHasElementAt(ary, 2) ? ary[2] : "";
    return true;
}

/**
 * Internal use only.
 *
 * Parses a "state" which can be "true", "on", "yes", or 1 to indicate |true|,
 * or "false", "off", "no", or 0 to indicate |false|.
 *
 * Stores result in |e[name]|.
 */
// @undocumented
CommandManager.prototype.argTypes["state"] =
function parse_state (e, name)
{
    var ary =
        e.unparsedData.match (/(true|on|yes|1|false|off|no|0)(?:\s+(.*))?$/i);
    if (!ary)
        return false;
    if (ary[1].search(/true|on|yes|1/i) != -1)
        e[name] = true;
    else
        e[name] = false;
    e.unparsedData = arrayHasElementAt(ary, 2) ? ary[2] : "";
    return true;
}

/**
 * Internal use only.
 *
 * Parses a "toggle" which can be "true", "on", "yes", or 1 to indicate |true|,
 * or "false", "off", "no", or 0 to indicate |false|.  In addition, the string
 * "toggle" is accepted, in which case |e[name]| will be the string "toggle".
 *
 * Stores result in |e[name]|.
 */
// @undocumented
CommandManager.prototype.argTypes["toggle"] =
function parse_toggle (e, name)
{
    var ary = e.unparsedData.match
        (/(toggle|true|on|yes|1|false|off|no|0)(?:\s+(.*))?$/i);

    if (!ary)
        return false;
    if (ary[1].search(/toggle/i) != -1)
        e[name] = "toggle";
    else if (ary[1].search(/true|on|yes|1/i) != -1)
        e[name] = true;
    else
        e[name] = false;
    e.unparsedData = arrayHasElementAt(ary, 2) ? ary[2] : "";
    return true;
}

/**
 * Internal use only.
 *
 * Returns all unparsed data to the end of the line.
 *
 * Stores result in |e[name]|.
 */
// @undocumented
CommandManager.prototype.argTypes["rest"] =
function parse_rest (e, name)
{
    e[name] = e.unparsedData;
    e.unparsedData = "";
    return true;
}

/**
 * Internal use only.
 *
 * Parses the rest of the unparsed data the same way the previous argument was
 * parsed.  Can't be used as the first parameter.  if |name| is "..." then the
 * name of the previous argument, plus the suffix "List" will be used instead.
 *
 * Stores result in |e[name]| or |e[lastName + "List"]|.
 */
// @undocumented
CommandManager.prototype.argTypes["..."] =
function parse_repeat (e, name, cm)
{
    ASSERT (e.currentArgIndex > 0, "<...> can't be the first argument.");

    var lastArg = e.command.argNames[e.currentArgIndex - 1];
    if (lastArg == ":")
        lastArg = e.command.argNames[e.currentArgIndex - 2];

    var listName = lastArg + "List";
    e[listName] = [ e[lastArg] ];

    while (e.unparsedData)
    {
        if (!cm.parseArgument(e, lastArg))
            return false;
        e[listName].push(e[lastArg]);
    }

    e[lastArg] = e[listName][0];
    return true;
}
