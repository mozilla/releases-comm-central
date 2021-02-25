/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
/*
 * depends on utils.js, and the connection-*.js implementations.
 * 
 * loads an appropriate connection implementation, or dies trying.
 *
 */

function connection_init(libPath)
{
    
    if (jsenv.HAS_XPCOM)
        load (libPath + "connection-xpcom.js");
    else if (jsenv.HAS_RHINO)
        load (libPath + "connection-rhino.js");
    else
    {
        dd ("No connection object for this platform.");
        return false;
    }

    return true;

}


