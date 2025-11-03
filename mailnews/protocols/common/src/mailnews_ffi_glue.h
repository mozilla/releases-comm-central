/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_PROTOCOLS_COMMON_SRC_MAILNEWSFFIGLUE_H_
#define COMM_MAILNEWS_PROTOCOLS_COMMON_SRC_MAILNEWSFFIGLUE_H_

#include "nsILoadInfo.h"
#include "nsINode.h"
#include "nsIPrincipal.h"

/**
 * Helper function to instantiate an `nsILoadInfo`, with an
 * `nsICookieJarSettings` that's configured to allow cookies to be persisted
 * even if `aLoadingNode` is null.
 *
 * Note that no cookie is persisted if the user's settings dictate so.
 *
 * If a `nsILoadInfo` could not be instantiated, an error is returned.
 */
extern "C" nsresult new_loadinfo_with_cookie_settings(
    nsIPrincipal* aLoadingPrincipal, nsIPrincipal* aTriggeringPrincipal,
    nsINode* aLoadingNode, nsSecurityFlags aSecurityFlags,
    nsContentPolicyType aContentPolicyType, uint32_t aSandboxFlags,
    nsILoadInfo** outLoadInfo);

#endif
