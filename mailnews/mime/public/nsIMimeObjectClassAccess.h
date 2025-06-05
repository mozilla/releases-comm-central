/* -*- Mode: C; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * This interface is implemented by libmime. This interface is used by
 * a Content-Type handler "Plug In" (i.e. vCard) for accessing various
 * internal information about the object class system of libmime. When
 * libmime progresses to a C++ object class, this would probably change.
 */

#ifndef COMM_MAILNEWS_MIME_PUBLIC_NSIMIMEOBJECTCLASSACCESS_H_
#define COMM_MAILNEWS_MIME_PUBLIC_NSIMIMEOBJECTCLASSACCESS_H_

// {C09EDB23-B7AF-11d2-B35E-525400E2D63A}
#define NS_IMIME_OBJECT_CLASS_ACCESS_IID \
  {0xc09edb23, 0xb7af, 0x11d2, {0xb3, 0x5e, 0x52, 0x54, 0x0, 0xe2, 0xd6, 0x3a}}

#include "nsISupports.h"

class nsIMimeObjectClassAccess : public nsISupports {
 public:
  NS_INLINE_DECL_STATIC_IID(NS_IMIME_OBJECT_CLASS_ACCESS_IID)

  // These methods are all implemented by libmime to be used by
  // content type handler plugins for processing stream data.

  // This is the write call for outputting processed stream data.
  NS_IMETHOD MimeObjectWrite(void* mimeObject, char* data, int32_t length,
                             bool user_visible_p) = 0;

  // The following group of calls expose the pointers for the object
  // system within libmime.
  NS_IMETHOD GetmimeInlineTextClass(void** ptr) = 0;
  NS_IMETHOD GetmimeLeafClass(void** ptr) = 0;
  NS_IMETHOD GetmimeObjectClass(void** ptr) = 0;
  NS_IMETHOD GetmimeContainerClass(void** ptr) = 0;
  NS_IMETHOD GetmimeMultipartClass(void** ptr) = 0;
  NS_IMETHOD GetmimeMultipartSignedClass(void** ptr) = 0;
  NS_IMETHOD GetmimeEncryptedClass(void** ptr) = 0;

  NS_IMETHOD MimeCreate(char* content_type, void* hdrs, void* opts,
                        void** ptr) = 0;
};

#endif  // COMM_MAILNEWS_MIME_PUBLIC_NSIMIMEOBJECTCLASSACCESS_H_
