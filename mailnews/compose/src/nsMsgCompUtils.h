/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef _nsMsgCompUtils_H_
#define _nsMsgCompUtils_H_

#include "nscore.h"
#include "mozilla/dom/Document.h"
#include "nsMsgCompFields.h"
#include "nsIMsgSend.h"
#include "nsIMsgCompUtils.h"

class nsIArray;
class nsIDocument;
class nsIPrompt;

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

//
// Various utilities for building parts of MIME encoded
// messages during message composition
//

nsresult mime_sanity_check_fields_recipients(const char* to, const char* cc,
                                             const char* bcc,
                                             const char* newsgroups);

nsresult mime_sanity_check_fields(
    const char* from, const char* reply_to, const char* to, const char* cc,
    const char* bcc, const char* fcc, const char* newsgroups,
    const char* followup_to, const char* /*subject*/,
    const char* /*references*/, const char* /*organization*/,
    const char* /*other_random_headers*/);

nsresult mime_generate_headers(nsIMsgCompFields* fields,
                               nsMsgDeliverMode deliver_mode,
                               msgIWritableStructuredHeaders* headers);

char* mime_make_separator(const char* prefix);
char* mime_gen_content_id(uint32_t aPartNum, const char* aEmailAddress);

bool mime_7bit_data_p(const char* string, uint32_t size);

char* mime_fix_header_1(const char* string, bool addr_p, bool news_p);
char* mime_fix_header(const char* string);
char* mime_fix_addr_header(const char* string);
char* mime_fix_news_header(const char* string);

bool mime_type_requires_b64_p(const char* type);
bool mime_type_needs_charset(const char* type);

char* msg_make_filename_qtext(const char* srcText, bool stripCRLFs);

char* RFC2231ParmFolding(const char* parmName, const char* parmValue);

//
// network service type calls...
//
nsresult nsMsgNewURL(nsIURI** aInstancePtrResult, const nsCString& aSpec);
char* nsMsgGetLocalFileFromURL(const char* url);

char* nsMsgParseURLHost(const char* url);

char* GenerateFileNameFromURI(nsIURI* aURL);

//
// Folder calls...
//
void GetFolderURIFromUserPrefs(nsMsgDeliverMode aMode, nsIMsgIdentity* identity,
                               nsCString& uri);

// Check if we should use format=flowed
void GetSerialiserFlags(bool* flowed, bool* formatted);

PR_END_EXTERN_C

#endif /* _nsMsgCompUtils_H_ */
