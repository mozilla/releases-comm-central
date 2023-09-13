/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mimemdig.h"
#include "prlog.h"
#include "nsMimeTypes.h"

#define MIME_SUPERCLASS mimeMultipartClass
MimeDefClass(MimeMultipartDigest, MimeMultipartDigestClass,
             mimeMultipartDigestClass, &MIME_SUPERCLASS);

static int MimeMultipartDigestClassInitialize(MimeObjectClass* oclass) {
  PR_ASSERT(!oclass->class_initialized);
  MimeMultipartClass* mclass = (MimeMultipartClass*)oclass;
  mclass->default_part_type = MESSAGE_RFC822;
  return 0;
}
