/* -*- Mode: C; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef _MIMETEXTHTMLPARSED_H_
#define _MIMETEXTHTMLPARSED_H_

#include "mimethtm.h"

typedef struct MimeInlineTextHTMLParsedClass MimeInlineTextHTMLParsedClass;
typedef struct MimeInlineTextHTMLParsed      MimeInlineTextHTMLParsed;

struct MimeInlineTextHTMLParsedClass {
  MimeInlineTextHTMLClass html;
};

extern MimeInlineTextHTMLParsedClass mimeInlineTextHTMLParsedClass;

struct MimeInlineTextHTMLParsed {
  MimeInlineTextHTML    html;
  nsString             *complete_buffer;  // Gecko parser expects wide strings
};

#define MimeInlineTextHTMLParsedClassInitializer(ITYPE,CSUPER) \
  { MimeInlineTextHTMLClassInitializer(ITYPE,CSUPER) }

#endif /* _MIMETEXTHTMLPARSED_H_ */
