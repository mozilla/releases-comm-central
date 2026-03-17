/* -*- Mode: C; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_MIME_SRC_MIMEMOTH_H_
#define COMM_MAILNEWS_MIME_SRC_MIMEMOTH_H_

#include "mimemult.h"

/* The MimeMultipartOther class is used for any and all
   otherwise-unrecognised subparts of multipart/.
 */

typedef struct MimeMultipartOtherClass MimeMultipartOtherClass;
typedef struct MimeMultipartOther MimeMultipartOther;

struct MimeMultipartOtherClass {
  MimeMultipartClass multipart;
};

extern MimeMultipartOtherClass mimeMultipartOtherClass;

struct MimeMultipartOther {
  MimeMultipart multipart;
};

#define MimeMultipartOtherClassInitializer(ITYPE, CSUPER) \
  {MimeMultipartClassInitializer(ITYPE, CSUPER)}

#endif  // COMM_MAILNEWS_MIME_SRC_MIMEMOTH_H_
