/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function initNetworks()
{
    let migrated = Services.prefs.getBoolPref("extensions.irc.network_migrated",
                                              false);
    let networksFile = new nsLocalFile(client.prefs["profilePath"]);
    networksFile.append("networks." + (migrated ? "json" : "txt"));

    let createDefault = !networksFile.exists();
    let networkList = {};
    // Populate networkList with defaults if no file exists or migrating from
    // previous networks.txt file usage.
    if (createDefault || !migrated)
    {
        networkList = networksGetDefaults();
    }

    if (!createDefault)
    {
        let userNetworkList = [];

        let networksLoader = migrated ? new JSONSerializer(networksFile)
                                      : new TextSerializer(networksFile);
        if (networksLoader.open("<"))
        {
            let item = networksLoader.deserialize();
            if (isinstance(item, Array))
                userNetworkList = item;
            else
                dd("Malformed networks file!");
            networksLoader.close();
        }

        // When migrating this merges the user's network list with the default
        // ones otherwise this populates the empty networkList.
        for (let network of userNetworkList)
        {
            let lowerNetName = network.name.toLowerCase();
            if ((lowerNetName in networkList) && ("isDeleted" in network))
            {
                delete networkList[lowerNetName];
            }
            else if (!("isDeleted" in network))
            {
                networkList[lowerNetName] = network;
                networkList[lowerNetName].name = lowerNetName;
            }
        }
    }


    if (!migrated)
    {
        Services.prefs.setBoolPref("extensions.irc.network_migrated", true);
    }

    // Sync to client.networks.
    networksSyncFromList(networkList);

    // If we created a new file with the defaults, save it.
    if (createDefault || !migrated)
        networksSaveList(networkList);
}

function networksGetDefaults()
{
    var networks = new Object();

    // Set up default network list.
    networks["libera.chat"] = {
        displayName:  "libera.chat",
        servers: [{hostname: "irc.libera.chat", port:6697, isSecure: true},
                  {hostname: "irc.libera.chat", port:6667}]};
   networks["slashnet"] = {
        displayName:  "slashnet",
        servers: [{hostname: "irc.slashnet.org", port:6667}]};
    networks["dalnet"] = {
        displayName:  "dalnet",
        servers: [{hostname: "irc.dal.net", port:6667},
                  {hostname: "irc.dal.net", port:6697, isSecure: true},
                  {hostname: "irc.au.dal.net", port:6667},
                  {hostname: "irc.eu.dal.net", port:6667},
                  {hostname: "irc.us.dal.net", port:6667}]};
    networks["undernet"] = {
        displayName:  "undernet",
        servers: [{hostname: "irc.undernet.org", port:6667},
                  {hostname: "eu.undernet.org", port:6667},
                  {hostname: "us.undernet.org", port:6667}]};
    networks["webbnet"] = {
        displayName:  "webbnet",
        servers: [{hostname: "irc.webbnet.info", port:6667}]};
    networks["quakenet"] = {
        displayName:  "quakenet",
        servers: [{hostname: "irc.quakenet.org", port:6667},
                  {hostname: "se.quakenet.org", port:6667},
                  {hostname: "uk.quakenet.org", port:6667},
                  {hostname: "us.quakenet.org", port:6667}]};
    networks["ircnet"] = {
        displayName:  "ircnet",
        servers: [{hostname: "open.ircnet.net", port:6667},
                  {hostname: "au.ircnet.org", port:6667},
                  {hostname: "eu.ircnet.org", port:6667},
                  {hostname: "us.ircnet.org", port:6667}]};
    networks["efnet"] = {
        displayName:  "efnet",
        servers: [{hostname: "irc.efnet.org", port: 6667}]};
    networks["hispano"] = {
        displayName:  "hispano",
        servers: [{hostname: "irc.irc-hispano.org", port: 6667}]};
    networks["freenode"] = {
        displayName:  "freenode",
        servers: [{hostname: "chat.freenode.net", port:6697, isSecure: true},
                  {hostname: "chat.freenode.net", port:7000, isSecure: true},
                  {hostname: "chat.freenode.net", port:6667}]};

    for (var name in networks)
        networks[name].name = name;

    return networks;
}

function networksToNetworkList()
{
    var networkList = {};

    // Create a networkList from client.networks.
    for (let name in client.networks)
    {
        let net = client.networks[name];
        // Skip temporary networks, as they're created to wrap standalone
        // servers only.
        if (net.temporary)
            continue;

        let listNet = { name: net.canonicalName, displayName: net.unicodeName,
                        servers: [] };

        // Populate server list (no merging here).
        for (let i = 0; i < net.serverList.length; i++)
        {
            let serv = net.serverList[i];
            let listServ = { hostname: serv.hostname, port: serv.port,
                             isSecure: serv.isSecure };
            listNet.servers.push(listServ);
        }
        networkList[net.canonicalName] = listNet;
    }

    return networkList;
}

function networksSyncFromList(networkList)
{
    // Copy to and update client.networks from networkList.
    for (let name in networkList)
    {
        let listNet = networkList[name];

        // Create new network object if necessary.
        if (!client.getNetwork(name))
            client.addNetwork(name, []);

        // Get network object and make sure server list is empty.
        let net = client.getNetwork(name);
        net.clearServerList();

        // Update server list.
        for (let listServ of listNet.servers)
        {
            // Make sure these exist.
            if (!("isSecure" in listServ))
                listServ.isSecure = false;

            // NOTE: this must match the name given by CIRCServer.
            let servName = ":" + listServ.hostname + ":" + listServ.port;

            if (!(servName in net.servers))
            {
                net.addServer(listServ.hostname, listServ.port,
                              listServ.isSecure);
            }
            let serv = net.servers[servName];

            serv.isSecure = listServ.isSecure;
        }
    }

    // Remove network objects that aren't in networkList.
    for (let name in client.networks)
    {
        // Skip temporary networks, as they don't matter.
        let net = client.networks[name];
        if (net.temporary)
            continue;
        if (!(net.canonicalName in networkList))
            client.removeNetwork(net.canonicalName);
    }
}

function networksSaveList(networkList)
{
    var networksFile = new nsLocalFile(client.prefs["profilePath"]);
    networksFile.append("networks.json");
    var networksLoader = new JSONSerializer(networksFile);
    if (networksLoader.open(">"))
    {
        networksLoader.serialize(Object.values(networkList));
        networksLoader.close();
    }
}

function networkHasSecure(serverList)
{
    // Test to see if the network has a secure server.
    let hasSecure = false;
    for (let s in serverList)
    {
        if (serverList[s].isSecure)
        {
            hasSecure = true;
            break;
        }
    }
    return hasSecure;
}
