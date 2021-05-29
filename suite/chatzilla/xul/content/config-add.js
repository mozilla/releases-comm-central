/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var rv, rad, box1, box2;

function changeType()
{
    box2.disabled = (rad.value == "net");
}

function onOK()
{
    rv.ok = true;
    
    rv.type = rad.value;
    rv.net = box1.value;
    rv.chan = box2.value;
    
    return true;
}

function onCancel()
{
    rv.ok = false;
    
    return true;
}

function onLoad()
{
    rad = document.getElementById("prefType");
    box1 = document.getElementById("prefName1");
    box2 = document.getElementById("prefName2");
    
    rv = window.arguments[0];
    
    if (!("type" in rv))
        rv.type = "";
    if (!("net" in rv))
        rv.net = "";
    if (!("chan" in rv))
        rv.chan = "";
    rv.ok = false;
    
    if (rv.type == "net")
        rad.selectedIndex = 0;
    if (rv.type == "chan")
        rad.selectedIndex = 1;
    if (rv.type == "user")
        rad.selectedIndex = 2;
    
    box1.value = rv.net || "";
    box2.value = rv.chan || "";
}
