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

    var pcs = Cc["@instantbird.org/libpurple/core;1"]
              .getService(Ci.purpleICoreService);

    var proxyInfoCtr = Components.Constructor("@instantbird.org/purple/proxyinfo;1",
                                              "purpleIProxyInfo");
    var proxyInfo;
    var account = window.arguments[0];
    if (account) {
      proxyInfo = new proxyInfoCtr();
      proxyInfo.type = Ci.purpleIProxyInfo.useGlobal;
      document.getElementById("useGlobal").proxy = proxyInfo;
      var globalProxy = pcs.globalProxy;
      document.getElementById("globalProxy").textContent =
        this.getProxyDescription(globalProxy);
    }
    else {
      let global = document.getElementById("useGlobal");
      global.parentNode.removeChild(global);
      document.getElementById("useAsGlobalSettings").collapsed = true;
      document.getElementById("proxyDialogHeader").collapsed = true;
    }

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

    var proxies = getIter(pcs.getProxies());
    var proxyList = document.getElementById("proxylist");
    for (let proxy in proxies) {
      let item = document.createElement("richlistitem");
      item.setAttribute("proxy", "true");
      proxyList.insertBefore(item, document.getElementById("newProxy"));
      item.proxy = proxy;
    }

    var key = null;
    if (!account)
      key = pcs.globalProxy.key;
    else if (account.proxy)
      key = account.proxy.key;

    if (key) {
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
    var bundle = document.getElementById("proxiesBundle");

    if (type == Ci.purpleIProxyInfo.noProxy)
      return bundle.getString("proxies.directConnection");

    if (type == Ci.purpleIProxyInfo.useEnvVar)
      return bundle.getString("proxies.useEnvironment");

    // At this point, we should have either a SOCKS or HTTP proxy.
    var result;
    if (type == Ci.purpleIProxyInfo.httpProxy)
      result = bundle.getString("proxies.http");
    else if (type == Ci.purpleIProxyInfo.socks4Proxy)
      result = bundle.getString("proxies.socks4");
    else if (type == Ci.purpleIProxyInfo.socks5Proxy)
      result = bundle.getString("proxies.socks5");
    else
      throw "Unknown proxy type";

    if (result)
      result += " ";

    if (aProxy.username)
      result += aProxy.username + "@";

    return result + aProxy.host + ":" + aProxy.port;
  },

  onSelect: function proxy_select() {
    let selectedItem = document.getElementById("proxylist").selectedItem;
    if (selectedItem) {
      document.getElementById("useAsGlobalSettings").disabled =
        selectedItem.id == "useGlobal";
    }
  },

  getValue: function proxy_getValue(aId) {
    return document.getElementById(aId).value;
  },

  accept: function proxy_accept() {
    var pcs = Cc["@instantbird.org/libpurple/core;1"]
              .getService(Ci.purpleICoreService);
    var promptService = Services.prompt;
    var item = document.getElementById("proxylist").selectedItem;
    if (item.id == "newProxy") {
      var type = this.getValue("proxyType");
      var host = this.getValue("hostname");
      var port = this.getValue("port");
      if (!host || !port) {
        promptService.alert(window, bundle.getString("proxies.alert.invalidInput.title"),
                            bundle.getString("proxies.alert.invalidInput.message"));
        return false;
      }
      var user = this.getValue("username");
      var pass = this.getValue("password");
      var proxies = getIter(pcs.getProxies());
      for (let proxy in proxies) {
        if (proxy.type == type && proxy.port == port &&
            proxy.host == host && proxy.username == user) {
          if (proxy.password == pass) {
            item.proxy = proxy;
          }
          else {
            if (promptService.confirm(window, bundle.getString("proxies.confirm.passwordUpdate.title"),
                                      bundle.getString("proxies.confirm.passwordUpdate.message"))) {
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

    var account = window.arguments[0];
    if (!account) {
      pcs.globalProxy = item.proxy;
      return true;
    }
      
    var globalCheckbox = document.getElementById("useAsGlobalSettings");
    if (!globalCheckbox.disabled && globalCheckbox.checked) {
      pcs.globalProxy = item.proxy;
      account.proxy = document.getElementById("useGlobal").proxy;
    }
    else
      account.proxy = item.proxy;
    return true;
  }
};
