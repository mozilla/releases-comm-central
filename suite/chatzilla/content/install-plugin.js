/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var client;

function onLoad() {
  client = window.arguments[0];

  centerDialog();
}

function changeAutoName(checked) {
  let pluginName = document.getElementById("txt-name");
  if (checked) {
    pluginName.setAttribute("disabled", "true");
    sourceChange(document.getElementById("txt-source").value);
  } else {
    pluginName.removeAttribute("disabled");
  }
}

function sourceChange(source) {
  let useAutoName = document.getElementById("chk-name-auto").checked;
  let pluginName = document.getElementById("txt-name");

  if (useAutoName) {
    let ary = source.match(/([^\/]+?)(\..{0,3}){0,2}$/);
    pluginName.value = ary ? ary[1] : source;
  }
}

function browseForSource() {
  let rv = pickOpen(
    client.bundle.getString("msg.install.plugin.select.source"),
    "*.js;*.zip;*.jar"
  );

  if ("file" in rv && rv.file) {
    rv.path = rv.file.path;
    rv.spec = rv.picker.fileURL.spec;
  }

  if (rv.reason == 0) {
    document.getElementById("txt-source").value = rv.spec;
  }
}

function doOK() {
  let name = document.getElementById("txt-name").value;
  let source = document.getElementById("txt-source").value;
  if (!name) {
    Services.prompt.alert(
      window,
      client.bundle.getString("msg.alert"),
      client.bundle.getString("msg.install.plugin.err.spec.name")
    );
    return false;
  }

  client.dispatch("install-plugin", { name, url: source });
}

function doCancel() {
  return true;
}
