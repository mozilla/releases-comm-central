/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_PROTOCOLS_COMMON_SRC_MAILNEWSUIGLUE_H_
#define COMM_MAILNEWS_PROTOCOLS_COMMON_SRC_MAILNEWSUIGLUE_H_

#include "ErrorList.h"
#include "nsIMsgIncomingServer.h"
#include "nsIURI.h"

/**
 * The symbols in this header file are implemented in Rust as part of the crate
 * `mailnews_prompt_glue`.
 */

/**
 * The outcome of the handling of an authentication error, and the action that
 * should be taken next.
 */
enum class AuthErrorOutcome {
  // The authentication problem might have been resolved (e.g. the user has set
  // a new password), so the request should be retried.
  RETRY,

  // The authentication error could not be recovered from, so the request should
  // be aborted.
  ABORT,
};

extern "C" {

/**
 * Handle an authentication failure that came from the given
 * `nsIMsgIncomingServer`.
 *
 * Note the actual error is not included here, because all we need to know here
 * is that we failed to authenticate against the remote server.
 */
nsresult handle_auth_failure_from_incoming_server(
    const nsIMsgIncomingServer* incoming_server, const nsIURI* uri,
    AuthErrorOutcome* action);

}  // extern "C"

#endif
