/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsIAuthModule.h"
#include "nsIMailAuthModule.h"
#include "nsMailAuthModule.h"
#include "nsString.h"
#include "plbase64.h"

NS_IMPL_ISUPPORTS(nsMailAuthModule, nsIMailAuthModule)

nsMailAuthModule::nsMailAuthModule() {}

nsMailAuthModule::~nsMailAuthModule() {}

/**
 * A simple wrap of CreateInstance and Init of nsIAuthModule.
 */
NS_IMETHODIMP
nsMailAuthModule::Init(const char* type, const char* serviceName,
                       uint32_t serviceFlags, const char16_t* domain,
                       const char16_t* username, const char16_t* password) {
  mAuthModule = nsIAuthModule::CreateInstance(type);
  return mAuthModule->Init(serviceName, serviceFlags, domain, username,
                           password);
}

/**
 * A wrap of nsIAuthModule::GetNextToken with two extra processings:
 * 1. inToken is base64 decoded then passed to nsIAuthModule::GetNextToken.
 * 2. The out value of nsIAuthModule::GetNextToken is base64 encoded then
 * assigned to outToken.
 */
NS_IMETHODIMP
nsMailAuthModule::GetNextToken(const nsACString& inToken,
                               nsACString& outToken) {
  nsresult rv;
  void *inBuf, *outBuf;
  uint32_t inBufLen = 0, outBufLen = 0;
  uint32_t len = inToken.Length();
  if (len > 0) {
    // Decode into the input buffer.
    inBufLen = (len * 3) / 4;  // sufficient size (see plbase64.h)
    inBuf = moz_xmalloc(inBufLen);

    // Strip off any padding (see bug 230351).
    char* challenge = ToNewCString(inToken);
    while (challenge[len - 1] == '=') len--;

    // We need to know the exact length of the decoded string to give to
    // the GSSAPI libraries. But NSPR's base64 routine doesn't seem capable
    // of telling us that. So, we figure it out for ourselves.

    // For every 4 characters, add 3 to the destination
    // If there are 3 remaining, add 2
    // If there are 2 remaining, add 1
    // 1 remaining is an error
    inBufLen =
        (len / 4) * 3 + ((len % 4 == 3) ? 2 : 0) + ((len % 4 == 2) ? 1 : 0);
    PL_Base64Decode(challenge, len, (char*)inBuf);
    free(challenge);
  } else {
    inBufLen = 0;
    inBuf = NULL;
  }

  rv = mAuthModule->GetNextToken(inBuf, inBufLen, &outBuf, &outBufLen);
  free(inBuf);
  NS_ENSURE_SUCCESS(rv, rv);

  // It's not an error if outBuf is empty, return an empty string as reply to
  // the server.
  if (outBuf) {
    char* base64Str = PL_Base64Encode((char*)outBuf, outBufLen, nullptr);
    if (base64Str) {
      outToken.Adopt(base64Str);
    } else {
      rv = NS_ERROR_OUT_OF_MEMORY;
    }
    free(outBuf);
  }

  return rv;
}
