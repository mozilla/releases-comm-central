/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_MAPI_MAPIHOOK_SRC_REGISTRY_H_
#define COMM_MAILNEWS_MAPI_MAPIHOOK_SRC_REGISTRY_H_

#include <objbase.h>

// This function will register a component in the Registry.

HRESULT RegisterServer(const CLSID& clsid, const WCHAR* szFriendlyName,
                       const WCHAR* szVerIndProgID, const WCHAR* szProgID);

// This function will unregister a component.

HRESULT UnregisterServer(const CLSID& clsid, const WCHAR* szVerIndProgID,
                         const WCHAR* szProgID);

#endif  // COMM_MAILNEWS_MAPI_MAPIHOOK_SRC_REGISTRY_H_
