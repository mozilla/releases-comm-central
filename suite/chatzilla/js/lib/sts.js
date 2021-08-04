/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * The base CIRCSTS object.
 */
function CIRCSTS()
{
    this.policyList = new Object();
    this.preloadList = new Object();
}

CIRCSTS.prototype.ENABLED = false;
CIRCSTS.prototype.USE_PRELOAD_LIST = true;

/**
 * Initializes the STS module.
 *     @param policyFile |nsIFile| for storing the STS cache.
 */
CIRCSTS.prototype.init = function(policyFile)
{
    this.policyFile = policyFile;
    this.readCacheFromFile();
}

/**
 * Reads the policy cache from disk.
 */
CIRCSTS.prototype.readCacheFromFile = function()
{
    if (!this.policyFile.exists())
        return;

    cacheReader = new JSONSerializer(this.policyFile);
    this.policyList = cacheReader.deserialize();
    cacheReader.close();
}

/**
 * Writes the policy cache to disk.
 */
CIRCSTS.prototype.writeCacheToFile = function()
{
    cacheWriter = new JSONSerializer(this.policyFile);
    cacheWriter.serialize(this.policyList);
    cacheWriter.close();
}

/**
 * Utility method for determining if an expiration time has passed.
 * An expire time of zero is never considered to be expired (as is
 * the case for knockout entries).
 *
 * @param expireTime the time to evaluate, in seconds since the UNIX
 *                   epoch.
 * @return           boolean value indicating whether the expiration
 *                   time has passed.
 */
CIRCSTS.prototype.isPolicyExpired = function(expireTime)
{
    if (!expireTime)
    {
        return false;
    }

    if (Date.now() > expireTime)
    {
        return true;
    }

    return false;
}

/**
 * Utility method for parsing the raw CAP value for an STS policy, typically
 * received via CAP LS or CAP NEW.
 *
 * @param params     the comma-separated list of parameters in
 *                   key[=value] format.
 * @return           the received parameters in JSON.
 *
 */
CIRCSTS.prototype.parseParameters = function(params)
{
    var rv = new Object();
    var keys = params.toLowerCase().split(",");
    for (var i = 0; i < keys.length; i++)
    {
        var [key, value] = keys[i].split("=");
        rv[key] = value;
    }

    return rv;
}

/**
 * Remove a policy from the cache.
 *
 * @param host       the host to remove a policy for.
 */
CIRCSTS.prototype.removePolicy = function(host)
{
    // If this host is in the preload list, we have to store a knockout entry.
    // To do this, we set the port and expiration time to zero.
    if (this.getPreloadPolicy(host))
    {
        this.policyList[host] = {
            port: 0,
            expireTime: 0
        };
    }
    else
    {
        delete this.policyList[host];
    }

    this.writeCacheToFile();
}

/**
 * Retrieves a policy from the preload list for the specified host.
 *
 * @param host       the host to retrieve a policy for.
 * @return           the policy from the preload list, if any.
 */
CIRCSTS.prototype.getPreloadPolicy = function(host)
{
    if (this.USE_PRELOAD_LIST && (host in this.preloadList))
    {
        return this.preloadList[host];
    }

    return null;
}

/**
 * Checks whether there is an upgrade policy in place for a given host
 * and, if so, returns the port to connect to.
 *
 * @param  host      the host to query an upgrade policy for.
 * @return           the secure port to connect to, if any.
 */
CIRCSTS.prototype.getUpgradePolicy = function(host)
{
    if (!this.ENABLED)
        return null;

    var cdata = this.policyList[host];
    var pdata = this.getPreloadPolicy(host);

    if (cdata)
    {
        // We have a cached policy.
        if (!this.isPolicyExpired(cdata.expireTime))
        {
            // Return null if it's a knockout entry.
            return cdata.port || null;
        }
        else if (!pdata)
        {
            // Remove the policy if it is expired and not in the preload list.
            this.removePolicy(host);
        }
    }

    if (pdata)
    {
        return pdata.port;
    }

    return null;
}

/**
 * Processes a given policy and caches it. This may also be used to renew a
 * persistance policy. This should ONLY be called if we are using a secure
 * connection. Insecure connections MUST switch to a secure port first.
 *
 * @param host       the host to store an STS policy for.
 * @param port       the currently connected secure port.
 * @param duration   the duration of the new policy.
 * @param duration   the duration of the new policy, in seconds. This may be
 *                   zero if the policy needs to be removed.
 */
CIRCSTS.prototype.setPolicy = function(host, port, duration)
{
    if (!this.ENABLED)
        return;

    port = Number(port);
    duration = Number(duration);

    // If duration is zero, that's an indication to immediately remove the
    // policy, so here's a shortcut.
    if (!duration)
    {
        this.removePolicy(host);
        return;
    }

    var expireTime = Date.now() + duration*1000;

    this.policyList[host] = {
        port: port,
        expireTime: expireTime
    };

    this.writeCacheToFile();
}
