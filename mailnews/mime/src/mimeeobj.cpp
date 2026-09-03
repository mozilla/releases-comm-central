/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mimeeobj.h"

#define MIME_SUPERCLASS mimeLeafClass
MimeDefClass(MimeExternalObject, MimeExternalObjectClass,
             mimeExternalObjectClass, &MIME_SUPERCLASS);

static int MimeExternalObject_parse_begin(MimeObject*);
static int MimeExternalObject_parse_buffer(const char*, int32_t, MimeClosure);
static int MimeExternalObject_parse_line(const char*, int32_t, MimeObject*);
static int MimeExternalObject_parse_decoded_buffer(const char*, int32_t,
                                                   MimeClosure);
static bool MimeExternalObject_displayable_inline_p(MimeObjectClass* clazz,
                                                    MimeHeaders* hdrs);

static int MimeExternalObjectClassInitialize(MimeObjectClass* oclass) {
  MimeLeafClass* lclass = (MimeLeafClass*)oclass;

  NS_ASSERTION(!oclass->class_initialized,
               "1.1 <rhp@netscape.com> 19 Mar 1999 12:00");
  oclass->parse_begin = MimeExternalObject_parse_begin;
  oclass->parse_buffer = MimeExternalObject_parse_buffer;
  oclass->parse_line = MimeExternalObject_parse_line;
  oclass->displayable_inline_p = MimeExternalObject_displayable_inline_p;
  lclass->parse_decoded_buffer = MimeExternalObject_parse_decoded_buffer;
  return 0;
}

static int MimeExternalObject_parse_begin(MimeObject* obj) {
  int status = ((MimeObjectClass*)&MIME_SUPERCLASS)->parse_begin(obj);
  if (status < 0) return status;

  // If we're writing this object, and we're doing it in raw form, then
  // now is the time to inform the backend what the type of this data is.
  //
  if (obj->output_p && obj->options && !obj->options->write_html_p &&
      !obj->options->state->first_data_written_p) {
    status = MimeObject_output_init(obj, 0);
    if (status < 0) return status;
    NS_ASSERTION(obj->options->state->first_data_written_p,
                 "1.1 <rhp@netscape.com> 19 Mar 1999 12:00");
  }

  return 0;
}

static int MimeExternalObject_parse_buffer(const char* buffer, int32_t size,
                                           MimeClosure closure) {
  MimeObject* obj = closure.AsMimeObject();
  if (!obj) {
    return -1;
  }

  NS_ASSERTION(!obj->closed_p, "1.1 <rhp@netscape.com> 19 Mar 1999 12:00");
  if (obj->closed_p) return -1;

  // Currently, we always want to stream, in order to determine the size of the
  // MIME object.

  /* The data will be base64-decoded and passed to
     MimeExternalObject_parse_decoded_buffer. */
  return ((MimeObjectClass*)&MIME_SUPERCLASS)
      ->parse_buffer(buffer, size, closure);
}

static int MimeExternalObject_parse_decoded_buffer(const char* buf,
                                                   int32_t size,
                                                   MimeClosure closure) {
  /* This is called (by MimeLeafClass->parse_buffer) with blocks of data
   that have already been base64-decoded.  This will only be called in
   the case where we're not emitting HTML, and want access to the raw
   data itself.

   We override the `parse_decoded_buffer' method provided by MimeLeaf
   because, unlike most children of MimeLeaf, we do not want to line-
   buffer the decoded data -- we want to simply pass it along to the
   backend, without going through our `parse_line' method.
   */

  /* Don't do a roundtrip through XPConnect when we're only interested in
   * metadata and size. This includes when we are writing HTML (otherwise, the
   * contents of binary attachments will just get dumped into messages when
   * reading them) and the JS emitter (which doesn't care about attachment data
   * at all). 0 means ok, the caller just checks for negative return value.
   */
  MimeObject* obj = closure.AsMimeObject();
  if (!obj) {
    return -1;
  }

  if (obj->options &&
      (obj->options->metadata_only || obj->options->write_html_p))
    return 0;
  else
    return MimeObject_write(obj, buf, size, true);
}

static int MimeExternalObject_parse_line(const char* line, int32_t length,
                                         MimeObject* obj) {
  NS_ERROR(
      "This method should never be called (externals do no line buffering).");
  return -1;
}

static bool MimeExternalObject_displayable_inline_p(MimeObjectClass* clazz,
                                                    MimeHeaders* hdrs) {
  return false;
}

#undef MIME_SUPERCLASS
#define MIME_SUPERCLASS mimeExternalObjectClass
MimeDefClass(MimeSuppressedCrypto, MimeSuppressedCryptoClass,
             mimeSuppressedCryptoClass, &MIME_SUPERCLASS);

static int MimeSuppressedCryptoClassInitialize(MimeObjectClass* oclass) {
  return MimeExternalObjectClassInitialize(oclass);
}

#undef MIME_SUPERCLASS
