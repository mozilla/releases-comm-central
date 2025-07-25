/* -*- Mode: C; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * This interface is implemented by content type handlers that will be
 * called upon by libmime to process various attachments types. The primary
 * purpose of these handlers will be to represent the attached data in a
 * viewable HTML format that is useful for the user
 *
 * Note: These will all register by their content type prefixed by the
 *       following:  mimecth:text/vcard
 *
 *       libmime will then use the XPCOM Component Manager to
 *       locate the appropriate Content Type handler
 */

#ifndef COMM_MAILNEWS_MIME_CTHANDLERS_GLUE_NSMIMECONTENTTYPEHANDLER_H_
#define COMM_MAILNEWS_MIME_CTHANDLERS_GLUE_NSMIMECONTENTTYPEHANDLER_H_

#include "nsIMimeContentTypeHandler.h"

typedef MimeObjectClass* (*MCTHCreateCTHClass)(
    const char* content_type, contentTypeHandlerInitStruct* initStruct);

class nsMimeContentTypeHandler : public nsIMimeContentTypeHandler {
 public:
  nsMimeContentTypeHandler(const char* aMimeType, MCTHCreateCTHClass callback);

  /* this macro defines QueryInterface, AddRef and Release for this class */
  NS_DECL_ISUPPORTS

  NS_IMETHOD GetContentType(char** contentType) override;

  NS_IMETHOD CreateContentTypeHandlerClass(
      const char* content_type, contentTypeHandlerInitStruct* initStruct,
      MimeObjectClass** objClass) override;

 private:
  virtual ~nsMimeContentTypeHandler();
  char* mimeType;
  MCTHCreateCTHClass realCreateContentTypeHandlerClass;
};

#endif  // COMM_MAILNEWS_MIME_CTHANDLERS_GLUE_NSMIMECONTENTTYPEHANDLER_H_
