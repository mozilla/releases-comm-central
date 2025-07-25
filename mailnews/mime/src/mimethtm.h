/* -*- Mode: C; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_MIME_SRC_MIMETHTM_H_
#define COMM_MAILNEWS_MIME_SRC_MIMETHTM_H_

#include "mimetext.h"

/* The MimeInlineTextHTML class implements the text/html MIME content type.
 */

typedef struct MimeInlineTextHTMLClass MimeInlineTextHTMLClass;
typedef struct MimeInlineTextHTML MimeInlineTextHTML;

struct MimeInlineTextHTMLClass {
  MimeInlineTextClass text;
};

extern MimeInlineTextHTMLClass mimeInlineTextHTMLClass;

struct MimeInlineTextHTML {
  MimeInlineText text;
  char* charset; /* If we sniffed a charset, do some converting! */
};

#define MimeInlineTextHTMLClassInitializer(ITYPE, CSUPER) \
  {MimeInlineTextClassInitializer(ITYPE, CSUPER)}

void MimeInlineTextHTML_insert_lang_div(MimeObject* obj, nsCString& message);
void MimeInlineTextHTML_remove_plaintext_tag(MimeObject* obj,
                                             nsCString& message);

#endif  // COMM_MAILNEWS_MIME_SRC_MIMETHTM_H_
