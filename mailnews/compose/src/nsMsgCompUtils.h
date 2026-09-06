/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_COMPOSE_SRC_NSMSGCOMPUTILS_H_
#define COMM_MAILNEWS_COMPOSE_SRC_NSMSGCOMPUTILS_H_

#include "mozilla/Logging.h"
#include "nsIMsgCompUtils.h"
#include "nscore.h"

class nsIArray;
class nsIFile;

namespace mozilla::dom {
class Document;
}

#define ANY_SERVER "anyfolder://"

// these are msg hdr property names for storing the original
// msg uri's and disposition(replied/forwarded) when queuing
// messages to send later.
#define ORIG_URI_PROPERTY "origURIs"
#define QUEUED_DISPOSITION_PROPERTY "queuedDisposition"

extern mozilla::LazyLogModule Compose;

class nsMsgCompUtils : public nsIMsgCompUtils {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIMSGCOMPUTILS

  nsMsgCompUtils();

 private:
  virtual ~nsMsgCompUtils();
};

already_AddRefed<nsIArray> GetEmbeddedObjects(
    mozilla::dom::Document* aDocument);

PR_BEGIN_EXTERN_C

//
// Create a file spec or file name using the name passed
// in as a template
//
nsresult nsMsgCreateTempFile(const char* tFileName, nsIFile** tFile);

char* mime_make_separator(const char* prefix);

// Check if we should use format=flowed
void GetSerialiserFlags(bool* flowed, bool* formatted);

PR_END_EXTERN_C

#endif  // COMM_MAILNEWS_COMPOSE_SRC_NSMSGCOMPUTILS_H_
