/* -*- Mode: C; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef _MIMETHSA_H_
#define _MIMETHSA_H_

#include "mimethtm.h"
#include "nsString.h"

typedef struct MimeInlineTextHTMLSanitizedClass
    MimeInlineTextHTMLSanitizedClass;
typedef struct MimeInlineTextHTMLSanitized MimeInlineTextHTMLSanitized;

struct MimeInlineTextHTMLSanitizedClass {
  MimeInlineTextHTMLClass html;
};

extern MimeInlineTextHTMLSanitizedClass mimeInlineTextHTMLSanitizedClass;

struct MimeInlineTextHTMLSanitized {
  MimeInlineTextHTML html;
  nsString* complete_buffer;  // Gecko parser expects wide strings
};

#define MimeInlineTextHTMLSanitizedClassInitializer(ITYPE, CSUPER) \
  {MimeInlineTextHTMLClassInitializer(ITYPE, CSUPER)}

#endif /* _MIMETHPL_H_ */
