/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsMimeContentTypeHandler.h"
#include "nsPgpMimeProxy.h"

extern "C" MimeObjectClass* MIME_PgpMimeCreateContentTypeHandlerClass(
    const char* content_type, contentTypeHandlerInitStruct* initStruct);

static nsresult nsPgpMimeMimeContentTypeHandlerConstructor(REFNSIID aIID,
                                                           void** aResult) {
  NS_ENSURE_ARG_POINTER(aResult);
  *aResult = nullptr;

  RefPtr<nsMimeContentTypeHandler> inst(new nsMimeContentTypeHandler(
      "multipart/encrypted", &MIME_PgpMimeCreateContentTypeHandlerClass));

  NS_ENSURE_TRUE(inst, NS_ERROR_OUT_OF_MEMORY);

  return inst->QueryInterface(aIID, aResult);
}
