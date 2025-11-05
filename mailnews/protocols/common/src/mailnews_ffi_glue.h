/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_PROTOCOLS_COMMON_SRC_MAILNEWSFFIGLUE_H_
#define COMM_MAILNEWS_PROTOCOLS_COMMON_SRC_MAILNEWSFFIGLUE_H_

#include "nsIAuthModule.h"
#include "nsILoadInfo.h"
#include "nsINode.h"
#include "nsIPrincipal.h"

/**
 * Helper function to instantiate an `nsIAuthModule` with the desired
 * method/type from outside of C++.
 *
 * If a module could not be retrieved, `NS_ERROR_INVALID_ARG` is returned. This
 * can happen if `authMethod` is unknown, or if we're trying to create an NTLM
 * module but NTLM is unavailable (see `nsNTLMAuthModule::InitTest`). This means
 * that, as long as this function succeeds, `outModule` is always a non-null
 * `nsIAuthModule`.
 */
extern "C" nsresult new_auth_module(const char* authMethod,
                                    nsIAuthModule** outModule);

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
