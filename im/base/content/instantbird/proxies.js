/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is the Instantbird messenging client, released
 * 2008.
 *
 * The Initial Developer of the Original Code is
 * Florian QUEZE <florian@instantbird.org>.
 * Portions created by the Initial Developer are Copyright (C) 2008
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

var gProxies = {
  load: function proxy_load() {

  // check the environment
  // see what the global settings are
  // build a list of existing proxies

    var pcs = Components.classes["@instantbird.org/purple/core;1"]
                        .getService(Ci.purpleICoreService);

    var proxyInfoCtr = Components.Constructor("@instantbird.org/purple/proxyinfo;1",
                                              "purpleIProxyInfo");
    var proxyInfo = new proxyInfoCtr();
    proxyInfo.type = Ci.purpleIProxyInfo.useGlobal;
    document.getElementById("useGlobal").proxy = proxyInfo;
    var globalProxy = pcs.globalProxy;
    document.getElementById("globalProxy").textContent =
      this.getProxyDescription(globalProxy);

    proxyInfo = new proxyInfoCtr();
    proxyInfo.type = Ci.purpleIProxyInfo.noProxy;
    document.getElementById("noProxy").proxy = proxyInfo;

    var useEnv = document.getElementById("useEnvironment");
    proxyInfo = new proxyInfoCtr();
    proxyInfo.type = Ci.purpleIProxyInfo.useEnvVar;
    useEnv.proxy = proxyInfo;
    var environment = Components.classes["@mozilla.org/process/environment;1"]
                                .getService(Ci.nsIEnvironment);
    var envproxy = environment.get("HTTP_PROXY") ||
                   environment.get("http_proxy") ||
                   environment.get("HTTPPROXY");
    if (envproxy)
      document.getElementById("envProxy").textContent = envproxy;

    var proxies = getIter(pcs.getProxies, Ci.purpleIProxy);
    var proxyList = document.getElementById("proxylist");
    for (let proxy in proxies) {
      let item = document.createElement("richlistitem");
      item.setAttribute("proxy", "true");
      proxyList.insertBefore(item, document.getElementById("newProxy"));
      item.proxy = proxy;
    }

    if (window.arguments[0].proxy) {
      var key = window.arguments[0].proxy.key;
      var items = proxyList.children;
      for (let i = 0; i < items.length; ++i) {
        if (items[i].proxy.key == key) {
          proxyList.selectedItem = items[i];
          break;
        }
      }
      if (key != "global")
        document.getElementById("useAsGlobalSettings").checked = false;
    }
  },

  // Note: this function should not be called for a purpleIProxyInfo
  // instance pointing to the Global Proxy
  getProxyDescription: function proxy_description(aProxy) {
    var type = aProxy.type;
    if (type == Ci.purpleIProxyInfo.noProxy)
      return "Direct Connection to the Internet (No Proxy)";

    if (type == Ci.purpleIProxyInfo.useEnvVar)
      return "Use environmental settings";

    // At this point, we should have either a socks or http proxy
    aProxy.QueryInterface(Ci.purpleIProxy);
    var result;
    if (type == Ci.purpleIProxyInfo.httpProxy)
      result = "Http ";
    else if (type == Ci.purpleIProxyInfo.socks4Proxy)
      result = "Socks 4 ";
    else if (type == Ci.purpleIProxyInfo.socks5Proxy)
      result = "Socks 5 ";
    else
      throw "Unknown proxy type";

    if (aProxy.username)
      result += aProxy.username + "@";

    return result + aProxy.host + ":" + aProxy.port;
  },

  onSelect: function proxy_select() {
    document.getElementById("useAsGlobalSettings").disabled =
      document.getElementById("proxylist").selectedItem.id == "useGlobal";
  },

  getValue: function proxy_getValue(aId) {
    return document.getElementById(aId).value;
  },

  accept: function proxy_accept() {
    var pcs = Components.classes["@instantbird.org/purple/core;1"]
                        .getService(Ci.purpleICoreService);
    var promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
                                  .getService(Ci.nsIPromptService);
    var item = document.getElementById("proxylist").selectedItem;
    if (item.id == "newProxy") {
      var type = this.getValue("proxyType");
      var host = this.getValue("hostname");
      var port = this.getValue("port");
      if (!host || !port) {
        promptService.alert(window, "Invalid input", "You need to enter at least a valid hostname and port number to add a new proxy.");
        return false;
      }
      var user = this.getValue("username");
      var pass = this.getValue("password");
      var proxies = getIter(pcs.getProxies, Ci.purpleIProxy);
      for (let proxy in proxies) {
        if (proxy.type == type && proxy.port == port &&
            proxy.host == host && proxy.username == user) {
          if (proxy.password == pass) {
            item.proxy = proxy;
          }
          else {
            if (promptService.confirm(window, "Update Proxy Password?",
                                      "The same proxy alreaady exists with a different password. Update the password?")) {
              proxy.password = pass;
              item.proxy = proxy;
            }
            else
              return false;
          }
          break;
        }
      }
      if (!item.proxy)
        item.proxy = pcs.createProxy(type, host, port, user, pass);
    }

    item.proxy.QueryInterface(Ci.purpleIProxyInfo);
    var globalCheckbox = document.getElementById("useAsGlobalSettings");
    if (!globalCheckbox.disabled && globalCheckbox.checked) {
      pcs.globalProxy = item.proxy;
      window.arguments[0].proxy = document.getElementById("useGlobal").proxy;
    }
    else
      window.arguments[0].proxy = item.proxy;
  }
};
