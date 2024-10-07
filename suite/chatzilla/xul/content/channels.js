/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var client;
var network;
var channels = new Array();
var tree = { view: null, newItem: null, share: new Object() };
var xul = new Object();


// Create list of operations. These are handled by common code.
const OPS = new Array();
OPS.push({ key: "noop",   ignore: true   });
OPS.push({ key: "list",   canStop: false });
OPS.push({ key: "load",   canStop: true  });
OPS.push({ key: "filter", canStop: true  });


// Define constants for each operation.
// JavaScript won't let you delete things declared with "var", workaround:
// NOTE: This order MUST be the same as those above!
window.s = 0;
const OP_LIST   = ++s;  // A /list operation on the server.
const OP_LOAD   = ++s;  // Loading the saved file.
const OP_FILTER = ++s;  // Filtering the loaded list.


// Define constants for the valid states of each operation.
// All states before STATE_START must be idle (stopped) states.
// All states from STATE_START onwards must be busy (running) states.
s = 0;
const STATE_IDLE  = ++s;  // Not doing this operation.
const STATE_ERROR = ++s;  // Error occurred: don't try do to any more.
const STATE_START = ++s;  // Starting an operation.
const STATE_RUN   = ++s;  // Running...
const STATE_STOP  = ++s;  // Clean-up/ending operation.
delete window.s;


// Store all the operation data here.
var data = {
    list:   { state: STATE_IDLE },
    load:   { state: STATE_IDLE },
    filter: { state: STATE_IDLE }
};


// This should keep things responsive enough, for the user to click buttons and
// edit the filter text and options, without giving up too much time to letting
// Gecko catch up.
const PROCESS_TIME_MAX = 200;
const PROCESS_DELAY    =  50;

const colIDToSortKey = { chanColName: "name",
                         chanColUsers: "users",
                         chanColTopic: "topic" };
const sortKeyToColID = { name: "chanColName",
                         users: "chanColUsers",
                         topic: "chanColTopic" };

function onLoad()
{
    function ondblclick(event) { tree.view.onRouteDblClick(event); };
    function onkeypress(event) { tree.view.onRouteKeyPress(event); };
    function onfocus(event)    { tree.view.onRouteFocus(event); };
    function onblur(event)     { tree.view.onRouteBlur(event); };

    function doJoin()
    {
        if (joinChannel())
            window.close();
    };

    client = window.arguments[0].client;
    client.joinDialog = window;

    window.dd = client.mainWindow.dd;
    window.ASSERT = client.mainWindow.ASSERT;
    window.toUnicode = client.mainWindow.toUnicode;
    window.getMsg = client.mainWindow.getMsg;
    window.MSG_FMT_JSEXCEPTION = client.mainWindow.MSG_FMT_JSEXCEPTION;
    window.MT_INFO = client.mainWindow.MT_INFO;

    // Import "MSG_CD_*"...
    for (var m in client.mainWindow)
    {
        if (m.substr(0, 7) == "MSG_CD_")
            window[m] = client.mainWindow[m];
    }

    // Cache all the XUL DOM elements.
    var elements = ["network", "networks", "channel", "includeTopic",
                    "lastUpdated", "join", "minUsers", "maxUsers", "refresh",
                    "bottomPanel", "channels", "loadLabel", "loadBarDeck",
                    "loadBar"];
    for (var i = 0; i < elements.length; i++)
        xul[elements[i]] = document.getElementById(elements[i]);

    // Set attribute on documentElement so we can do platform-specific CSS.
    document.documentElement.setAttribute("platform", client.platform);

    // Set up the channel tree view.
    tree.view = new XULTreeView(tree.share);
    tree.view.onRowCommand = doJoin;
    tree.view.cycleHeader = changeSort;
    xul.channels.treeBoxObject.view = tree.view;

    // Sort by user count, descending.
    changeSort("chanColUsers");

    xul.channels.addEventListener("dblclick", ondblclick, false);
    xul.channels.addEventListener("keypress", onkeypress, false);
    xul.channels.addEventListener("focus", onfocus, false);
    xul.channels.addEventListener("blur", onblur, false);

    tree.newItem = new ChannelEntry("", "", MSG_CD_CREATE);
    tree.newItem.first = true;
    tree.view.childData.appendChild(tree.newItem);

    var opener = window.arguments[0].opener;
    if (opener)
    {
        // Force the window to be the right size now, not later.
        window.sizeToContent();

        // Position it centered over, but never up or left of parent.
        var sx = Math.max((opener.outerWidth  - window.outerWidth ) / 2, 0);
        var sy = Math.max((opener.outerHeight - window.outerHeight) / 2, 0);
        window.moveTo(opener.screenX + sx, opener.screenY + sy);
    }

    setNetwork(window.arguments[0].network);
    setTimeout(updateOperations, PROCESS_DELAY);
    if (network)
        xul.channel.focus();
    else
        xul.network.focus();
}

function onUnload()
{
    delete client.joinDialog;
}

function onKeyPress(event)
{
    if (event.keyCode == event.DOM_VK_RETURN)
    {
        if (joinChannel())
            window.close();
        event.stopPropagation();
        event.preventDefault();
    }
    else if (event.keyCode == event.DOM_VK_UP)
    {
        if (tree.view.selectedIndex > 0)
        {
            tree.view.selectedIndex = tree.view.selectedIndex - 1;
            ensureRowIsVisible();
        }
        event.preventDefault();
    }
    else if (event.keyCode == event.DOM_VK_DOWN)
    {
        if (tree.view.selectedIndex < tree.view.rowCount - 1)
        {
            tree.view.selectedIndex = tree.view.selectedIndex + 1;
            ensureRowIsVisible();
        }
        event.preventDefault();
    }
}

function onShowingNetworks()
{
    while (xul.networks.lastChild)
        xul.networks.removeChild(xul.networks.lastChild);

    /* Show any network meeting at least 1 requirement:
     *   - Non-temporary (i.e. real network).
     *   - Currently connected.
     *   - Has visible tab in main window.
     */
    var networks = new Array();
    for (var n in client.networks)
    {
        if (!client.networks[n].temporary
            || client.networks[n].isConnected()
            || client.mainWindow.getTabForObject(client.networks[n]))
        {
            networks.push(client.networks[n].unicodeName);
        }
    }
    networks.sort();
    for (var i = 0; i < networks.length; i++)
    {
        var menuitem = document.createElement("menuitem");
        menuitem.setAttribute("label",  networks[i]);
        xul.networks.appendChild(menuitem);
    }
}

function onSelectionChange()
{
    update();
}

function onFilter()
{
    update();
    if (network)
        startOperation(OP_FILTER);
}

function setNetwork(newNetwork, noUpdate)
{
    xul.network.value = newNetwork ? newNetwork.unicodeName : "";
    update();
}

function update()
{
    let newNetwork = client.getNetwork(xul.network.value);
    if (network != newNetwork)
    {
        network = newNetwork;
        if (network)
            startOperation(OP_LOAD);
    }

    if (network)
    {
        var index = tree.view.selectedIndex;
        var rows = tree.view.childData;
        var row = index == -1 ? null : rows.locateChildByVisualRow(index);
        var listFile = getListFile();
        var listMod = 0;
        if (listFile.exists() && (listFile.fileSize > 0))
            listMod = listFile.lastModifiedTime;

        xul.join.disabled = network.isConnected() && (!row || !row.name);
        xul.lastUpdated.value = listMod ? getMsg(MSG_CD_UPDATED, [strftime(MSG_CD_UPDATED_FORMAT, new Date(listMod))]) : MSG_CD_UPDATED_NEVER;
        xul.refresh.disabled = !network.isConnected() ||
                               (getOperationState(OP_LIST) == STATE_START) ||
                               (getOperationState(OP_LIST) == STATE_RUN);
        xul.bottomPanel.selectedIndex = 1;
    }
    else
    {
        xul.join.disabled = !xul.network.value;
        xul.lastUpdated.value = "";
        xul.refresh.disabled = true;
        xul.bottomPanel.selectedIndex = 0;
    }
}

function joinChannel()
{
    update();
    if (xul.join.disabled)
        return false;

    /* Calculate the row index AS IF the 'create' row is visible. We're going
     * to use this so that the index chosen by the user is always consistent,
     * whatever the visibility of the 'create' row - an index of 0 is ALWAYS
     * the 'create' row, and >= 1 is ALWAYS the searched rows.
     */
    var index = tree.view.selectedIndex;
    var row = tree.view.childData.locateChildByVisualRow(index);
    var realIndex = index + (tree.newItem.isHidden ? 1 : 0);

    client.dispatch("attach", { ircUrl: xul.network.value + "/" + row.name });

    return true;
}

function focusSearch()
{
    xul.channel.focus();
}

function refreshList()
{
    startOperation(OP_LIST);
}

function updateProgress(label, pro)
{
    if (label)
    {
        xul.loadLabel.value = label;
    }
    else
    {
        var msg = getMsg(MSG_CD_SHOWING,
             [(tree.view.rowCount - (tree.newItem.isHidden ? 0 : 1)),
              channels.length]);
        xul.loadLabel.value = msg;
    }

    xul.loadBarDeck.selectedIndex = (typeof pro == "undefined") ? 1 : 0;

    if ((typeof pro == "undefined") || (pro == -1))
    {
        xul.loadBar.mode = "undetermined";
    }
    else
    {
        xul.loadBar.mode = "determined";
        xul.loadBar.value = pro;
    }
}

function changeSort(col)
{
    if (typeof col == "object")
        col = col.id;

    col = colIDToSortKey[col];
    // Users default to descending, others ascending.
    var dir = (col == "users" ? -1 : 1);

    if (col == tree.share.sortColumn)
        dir = -tree.share.sortDirection;

    var colID = sortKeyToColID[tree.share.sortColumn];
    var colNode = document.getElementById(colID);
    if (colNode)
    {
        colNode.removeAttribute("sortActive");
        colNode.removeAttribute("sortDirection");
    }

    tree.view.childData.setSortColumn(col, dir);

    colID = sortKeyToColID[tree.share.sortColumn];
    colNode = document.getElementById(colID);
    if (colNode)
    {
        colNode.setAttribute("sortActive", "true");
        var sortDir = (dir > 0 ? "ascending" : "descending");
        colNode.setAttribute("sortDirection", sortDir);
    }
}


// ***** BEGIN OPERATIONS CODE *****


/* Return the static data about an operation (e.g. whether it can be
 * stopped, etc.). The data returned is always the same for a given op code.
 */
function getOperation(op)
{
    ASSERT(op in OPS, "Invalid op-code: " + op);
    return OPS[op];
}

/* Returns the live data about an operation (e.g. current state). Accepts
 * either the op ID or the static data (as returned from getOperation(op)).
 */
function getOperationData(op)
{
    if (typeof op == "object")
        return data[op.key];
    return data[getOperation(op).key];
}

// Returns the current state of an operation; accepts same as getOperationData.
function getOperationState(op)
{
    return getOperationData(op).state;
}

function startOperation(op)
{
    var ops = getOperation(op);
    if (ops.ignore)
        return;

    var dbg = "startOperation(" + ops.key + ")";
    var opData = getOperationData(ops);

    // STATE_ERROR operations must not do anything. Assert and bail.
    if (!ASSERT(opData.state != STATE_ERROR, dbg + " in STATE_ERROR"))
        return;

    // Check we can stop a non-idle operation.
    if (!ASSERT((opData.state == STATE_IDLE) || ops.canStop,
           dbg + " not in STATE_IDLE and can't stop"))
    {
        return;
    }

    // Stop the current operation.
    if (opData.state != STATE_IDLE)
        stopOperation(op);

    // Begin!
    var opData = getOperationData(op);
    opData.state = STATE_START;
    processOperation(op);
    ASSERT(opData.state == STATE_RUN, dbg + " didn't enter STATE_RUN");
}

function updateOperations()
{
    for (var i = 1; i < OPS.length; i++)
    {
        var state = getOperationState(i);
        if ((state == STATE_RUN) || (state == STATE_STOP))
            processOperation(i);
    }

    setTimeout(updateOperations, PROCESS_DELAY);
}

function processOperation(op)
{
    var ops = getOperation(op);
    if (ops.ignore)
        return;

    var dbg = "processOperation(" + ops.key + ")";
    var opData = getOperationData(ops);

    var fn = "processOp";
    fn += ops.key[0].toUpperCase() + ops.key.substr(1);
    if (opData.state == STATE_START)
        fn += "Start";
    else if (opData.state == STATE_RUN)
        fn += "Run";
    else if (opData.state == STATE_STOP)
        fn += "Stop";
    // assert and return if we're in a different state:
    else if (!ASSERT(false, dbg + " invalid state: " + opData.state))
        return;

    try
    {
        var newState = window[fn](opData);
        if (typeof newState != "undefined")
            opData.state = newState;
    }
    catch(ex)
    {
        /* If an error has occurred, we display it (updateProgress) and then
         * halt our operations to prevent further damage.
         */
        dd("Exception in channels.js: " + dbg + ": " + fn + ": " + formatException(ex));
        updateProgress(formatException(ex));
        opData.state = STATE_ERROR;
    }
}

function stopOperation(op)
{
    var ops = getOperation(op);
    if (ops.ignore)
        return;

    var dbg = "stopOperation(" + ops.key + ")";
    var opData = getOperationData(ops);

    // STATE_ERROR operations must not do anything. Assert and bail.
    if (!ASSERT(opData.state != STATE_ERROR, dbg + " in STATE_ERROR"))
        return;

    // Nothing to do for STATE_IDLE. We shouldn't really be here, so assert.
    if (!ASSERT(opData.state != STATE_IDLE, dbg + " in STATE_IDLE"))
        return;

    // Force the end and process synchronously.
    opData.state = STATE_STOP;
    processOperation(op);
    ASSERT(opData.state == STATE_IDLE, dbg + " didn't enter STATE_IDLE");
}

// *****  END OPERATIONS CODE  *****


// ***** BEGIN OPERATION HANDLERS *****

function processOpListStart(opData)
{
    ASSERT(network, "No network");
    ASSERT(network.isConnected(), "Network is disconnected");

    // Updates the refresh button.
    update();

    // Show a general message until we get some data.
    updateProgress(MSG_CD_FETCHING, -1);

    // Get the file we're going to save to, and start the /list.
    var file = getListFile();
    network.list("", file.path);

    return STATE_RUN;
}

function processOpListRun(opData)
{
    // Update the progress and end if /list done for "list only" state.
    updateProgress(getMsg(MSG_CD_FETCHED, network._list.count), -1);

    // Stop if the network's /list has finished.
    return (network._list.done ? STATE_STOP : STATE_RUN);
}

function processOpListStop(opData)
{
    // Updates the refresh button.
    update();

    // Check that /list finished okay if we're just doing a list.
    if ("error" in network._list)
    {
        updateProgress(MSG_CD_ERROR_LIST);
    }
    else
    {
        updateProgress();
        if (getOperationState(OP_LOAD) == STATE_IDLE)
            startOperation(OP_LOAD);
    }

    return STATE_IDLE;
}

function processOpLoadStart(opData)
{
    ASSERT(network, "No network");

    // Nuke contents.
    tree.view.selectedIndex = -1;
    if (tree.view.childData.childData.length > 1)
        tree.view.childData.removeChildrenAtIndex(1, tree.view.childData.childData.length - 1);

    var file = getListFile();
    if (!file.exists())
    {
        // We tried to do a load, but the file does not exist. Start a list to
        // fill up the file.
        startOperation(OP_LIST);

        // File still doesn't exist, just give up.
        if (!file.exists())
            return STATE_IDLE;
    }

    // Nuke more stuff.
    channels = new Array();

    // And... here we go.
    opData.loadFile = new LocalFile(file, "<");
    opData.loadPendingData = "";
    opData.loadChunk = 10000;
    opData.loadedSoFar = 0;

    return STATE_RUN;
}

function processOpLoadRun(opData)
{
    // All states before STATE_START are "not running" states.
    var opListRunning = (getOperationState(OP_LIST) >= STATE_START);

    var end = Number(new Date()) + PROCESS_TIME_MAX;
    while (Number(new Date()) < end)
    {
        var nlIndex = opData.loadPendingData.indexOf("\n");
        if (nlIndex == -1)
        {
            opData.loadedSoFar += opData.loadChunk;
            var newChunk = opData.loadFile.read(opData.loadChunk);
            if (newChunk)
                opData.loadPendingData += newChunk;
            nlIndex = opData.loadPendingData.indexOf("\n");
            if (nlIndex == -1)
                break;
        }

        var line = opData.loadPendingData.substr(0, nlIndex);
        opData.loadPendingData = opData.loadPendingData.substr(nlIndex + 1);

        line = toUnicode(line, "UTF-8");
        var ary = line.match(/^([^ ]+) ([^ ]+) (.*)$/);
        if (ary)
        {
            var chan = new ChannelEntry(ary[1], ary[2], ary[3]);
            channels.push(chan);
        }
    }

    var dataLeft = opData.loadFile.inputStream.available();

    // We shouldn't update the display when listing as well, as we're not
    // going to show anything useful (always 100% or near to it, and
    // replaces the 'fetching' message).
    if (!opListRunning)
    {
        var pro = opData.loadedSoFar / (opData.loadedSoFar + dataLeft);
        pro = Math.round(100 * pro);
        updateProgress(getMsg(MSG_CD_LOADED, channels.length), pro);
    }

    // Done if there is no more data, and we're not *expecting* any more.
    if ((dataLeft == 0) && !opListRunning)
        return STATE_STOP;

    return STATE_RUN;
}

function processOpLoadStop(opData)
{
    if (channels.length > 0)
        tree.view.childData.appendChildren(channels);
    opData.loadFile.close();
    delete opData.loadFile;
    delete opData.loadPendingData;
    delete opData.loadChunk;
    delete opData.loadedSoFar;
    delete opData.loadNeverComplete;
    updateProgress();

    startOperation(OP_FILTER);

    return STATE_IDLE;
}

function processOpFilterStart(opData)
{
    // Catch filtering with the same options on the same channels:
    var newOptions = {network: xul.network.value.toLowerCase(),
                      text: xul.channel.value.toLowerCase(),
                      min: xul.minUsers.value * 1,
                      max: xul.maxUsers.value * 1,
                      listLen: channels.length,
                      searchTopics: xul.includeTopic.checked};

    if (("filterOptions" in window) &&
        equalsObject(window.filterOptions, newOptions))
    {
        return STATE_IDLE;
    }

    window.filterOptions = newOptions;

    opData.text = newOptions.text;
    opData.searchTopics = newOptions.searchTopics;
    opData.minUsers = newOptions.min;
    opData.maxUsers = newOptions.max;
    opData.exactMatch = null;
    opData.currentIndex = 0;
    opData.channelText = opData.text;

    // Log the filter, indicating which features the user is using.
    var filters = new Array();
    if (opData.channelText)
        filters.push("name");
    if (opData.searchTopics)
        filters.push("topics");
    if (opData.minUsers)
        filters.push("min-users");
    if (opData.maxUsers)
        filters.push("max-users");

    if (opData.channelText &&
        !["#", "&", "+", "!"].includes(opData.channelText[0]))
    {
        opData.channelText = "#" + opData.channelText;
    }
    else
    {
        // Log that user has specified an explicit prefix.
        filters.push("prefix");
    }

    // Update special "create channel" row, and select it.
    tree.newItem.name = opData.channelText;
    tree.newItem.unHide();

    // Scroll to the top and select the "create channel" row.
    tree.view.selectedIndex = 0;
    xul.channels.treeBoxObject.invalidateRow(0);
    xul.channels.treeBoxObject.scrollToRow(0);
    ensureRowIsVisible();

    updateProgress(getMsg(MSG_CD_FILTERING, [0, channels.length]), 0);

    return STATE_RUN;
}

function processOpFilterRun(opData)
{
    var end = Number(new Date()) + PROCESS_TIME_MAX;
    var more = false;

    // Save selection because freeze/thaw screws it up.
    // Note that we only save the item if it isn't the "create channel" row.
    var index = tree.view.selectedIndex;
    var item = null;
    if (index > 0)
        item = tree.view.childData.locateChildByVisualRow(index);

    tree.view.freeze();
    for (var i = opData.currentIndex; i < channels.length; i++)
    {
        var c = channels[i];

        var match = (c.nameLC.indexOf(opData.text) != -1) ||
                    (opData.searchTopics &&
                     (c.topicLC.indexOf(opData.text) != -1));

        if (opData.minUsers && (c.users < opData.minUsers))
            match = false;
        if (opData.maxUsers && (c.users > opData.maxUsers))
            match = false;

        if (match)
            c.unHide();
        else
            c.hide();

        if (match && (c.nameLC == opData.channelText))
            opData.exactMatch = c;

        opData.currentIndex = i;
        if ((new Date()) > end)
        {
            more = true;
            break;
        }
    }
    tree.view.thaw();

    // No item selected by user, so use our exact match instead.
    if (!item && opData.exactMatch)
        item = opData.exactMatch;

    // Restore selected item.
    if (item)
        tree.view.selectedIndex = item.calculateVisualRow();
    else
        tree.view.selectedIndex = 0;

    ensureRowIsVisible();

    updateProgress(getMsg(MSG_CD_FILTERING,
                          [opData.currentIndex, channels.length]),
                   100 * opData.currentIndex / channels.length);

    return (more ? STATE_RUN : STATE_STOP);
}

function processOpFilterStop(opData)
{
    if (opData.exactMatch)
    {
        tree.newItem.hide();
    }
    // If nothing is selected, select the "create channel" row.
    else if (tree.view.selectedIndex < 0)
    {
        tree.view.selectedIndex = 0;
    }

    ensureRowIsVisible();

    delete opData.text;
    delete opData.searchTopics;
    delete opData.minUsers;
    delete opData.maxUsers;
    delete opData.exactMatch;
    delete opData.currentIndex;
    delete opData.channelText;
    updateProgress();

    return STATE_IDLE;
}


// *****  END OPERATION HANDLERS  *****


function ensureRowIsVisible()
{
    if (tree.view.selectedIndex >= 0)
        xul.channels.treeBoxObject.ensureRowIsVisible(tree.view.selectedIndex);
    else
        xul.channels.treeBoxObject.ensureRowIsVisible(0);
}

function getListFile(temp)
{
    ASSERT(network, "No network");
    var file = new LocalFile(network.prefs["logFileName"]);
    if (temp)
        file.localFile.leafName = "list.temp";
    else
        file.localFile.leafName = "list.txt";
    return file.localFile;
}


// Tree ChannelEntry objects //
function ChannelEntry(name, users, topic)
{
    this.setColumnPropertyName("chanColName", "name");
    this.setColumnPropertyName("chanColUsers", "users");
    this.setColumnPropertyName("chanColTopic", "topic");

    // Nuke color codes and bold etc.
    topic = topic.replace(/[\x1F\x02\x0F\x16]/g, "");
    topic = topic.replace(/\x03\d{1,2}(?:,\d{1,2})?/g, "");

    this.name  = name;
    this.users = users;
    this.topic = topic;

    this.nameLC = this.name.toLowerCase();
    this.topicLC = this.topic.toLowerCase();
}

ChannelEntry.prototype = new XULTreeViewRecord(tree.share);

ChannelEntry.prototype.sortCompare =
function chanentry_sortcmp(a, b)
{
    var sc = a._share.sortColumn;
    var sd = a._share.sortDirection;

    // Make sure the special 'first' row is always first.
    if ("first" in a)
        return -1;
    if ("first" in b)
        return 1;

    if (sc == "users")
    {
        // Force a numeric comparison.
        a = 1 * a[sc];
        b = 1 * b[sc];
    }
    else
    {
        // Case-insensitive, please.
        a = a[sc].toLowerCase();
        b = b[sc].toLowerCase();
    }

    if (a < b)
        return -1 * sd;

    if (a > b)
        return 1 * sd;

    return 0;
}
