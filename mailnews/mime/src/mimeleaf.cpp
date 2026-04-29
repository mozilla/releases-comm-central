/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "modmimee.h"
#include "mimeleaf.h"
#include "nsMimeTypes.h"
#include "prmem.h"
#include "plstr.h"
#include "prlog.h"
#include "nsMimeStringResources.h"
#include "modmimee.h"  // for MimeConverterOutputCallback

#define MIME_SUPERCLASS mimeObjectClass
MimeDefClass(MimeLeaf, MimeLeafClass, mimeLeafClass, &MIME_SUPERCLASS);

static int MimeLeaf_initialize(MimeObject*);
static void MimeLeaf_finalize(MimeObject*);
static int MimeLeaf_parse_begin(MimeObject*);
static int MimeLeaf_parse_buffer(const char*, int32_t, MimeClosure);
static int MimeLeaf_parse_line(const char*, int32_t, MimeObject*);
static int MimeLeaf_close_decoder(MimeObject*);
static int MimeLeaf_parse_eof(MimeObject*, bool);
static bool MimeLeaf_displayable_inline_p(MimeObjectClass* clazz,
                                          MimeHeaders* hdrs);
/* Content-Transfer-Encoding decode helpers, currently supporting base64, quoted-printable, x-uuencode, and x-yencode. */
// TODO: Content-Transfer-Encoding: binary (bug 19352)
static int MimeLeaf_discard_decoded(const char* buf, int32_t size,
                                    MimeClosure closure);
static int MimeLeaf_create_decoder(MimeObject* obj,
                                   MimeConverterOutputCallback output_fn);
static int MimeLeaf_decode_buffer(const char* buffer, int32_t size,
                                  MimeObject* obj,
                                  MimeConverterOutputCallback output_fn);

static int MimeLeafClassInitialize(MimeObjectClass* oclass) {
  MimeLeafClass* clazz = (MimeLeafClass*)oclass;
  NS_ASSERTION(!oclass->class_initialized,
               "1.1 <rhp@netscape.com> 19 Mar 1999 12:00");
  oclass->initialize = MimeLeaf_initialize;
  oclass->finalize = MimeLeaf_finalize;
  oclass->parse_begin = MimeLeaf_parse_begin;
  oclass->parse_buffer = MimeLeaf_parse_buffer;
  oclass->parse_line = MimeLeaf_parse_line;
  oclass->parse_eof = MimeLeaf_parse_eof;
  oclass->displayable_inline_p = MimeLeaf_displayable_inline_p;
  clazz->close_decoder = MimeLeaf_close_decoder;

  /* Default `parse_buffer' method is one which line-buffers the now-decoded
   data and passes it on to `parse_line'.  (We snarf the implementation of
   this method from our superclass's implementation of `parse_buffer', which
   inherited it from MimeObject.)
   */
  clazz->parse_decoded_buffer =
      ((MimeObjectClass*)&MIME_SUPERCLASS)->parse_buffer;

  return 0;
}

static int MimeLeaf_initialize(MimeObject* obj) {
  /* This is an abstract class; it shouldn't be directly instantiated. */
  NS_ASSERTION(obj->clazz != (MimeObjectClass*)&mimeLeafClass,
               "1.1 <rhp@netscape.com> 19 Mar 1999 12:00");

  // Initial size is -1 (meaning "unknown size") - we'll correct it in
  // parse_buffer.
  MimeLeaf* leaf = (MimeLeaf*)obj;
  leaf->sizeSoFar = -1;

  return ((MimeObjectClass*)&MIME_SUPERCLASS)->initialize(obj);
}

static void MimeLeaf_finalize(MimeObject* object) {
  MimeLeaf* leaf = (MimeLeaf*)object;
  object->clazz->parse_eof(object, false);

  /* Free the decoder data, if it's still around.  It was probably freed
   in MimeLeaf_parse_eof(), but just in case... */
  if (leaf->decoder_data) {
    MimeDecoderDestroy(leaf->decoder_data, true);
    leaf->decoder_data = 0;
  }

  ((MimeObjectClass*)&MIME_SUPERCLASS)->finalize(object);
}

static int MimeLeaf_parse_begin(MimeObject* obj) {
  int status = MimeLeaf_create_decoder(
      obj, ((MimeLeafClass*)obj->clazz)->parse_decoded_buffer);
  if (status < 0) return status;

  return ((MimeObjectClass*)&MIME_SUPERCLASS)->parse_begin(obj);
}

static int MimeLeaf_parse_buffer(const char* buffer, int32_t size,
                                 MimeClosure closure) {
  MimeObject* obj = closure.AsMimeObject();
  if (!obj) {
    return -1;
  }

  NS_ASSERTION(!obj->closed_p, "1.1 <rhp@netscape.com> 19 Mar 1999 12:00");

  if (obj->closed_p) return -1;

  /* If we're not supposed to write this object, bug out now.
   * Still track size so attachment emptiness checks work for hidden parts.
   */
  if (!obj->output_p || !obj->options || !obj->options->output_fn) {
    MimeLeaf* leaf = (MimeLeaf*)obj;
    if (leaf->sizeSoFar == -1) leaf->sizeSoFar = 0;
    leaf->sizeSoFar += size;
    return 0;
  }

  return MimeLeaf_decode_buffer(
      buffer, size, obj, ((MimeLeafClass*)obj->clazz)->parse_decoded_buffer);
}

/* No-op sink: decoder runs for size accounting, decoded bytes discarded. */
static int MimeLeaf_discard_decoded(const char* buf, int32_t size,
                                    MimeClosure closure) {
  return 0;
}

static int MimeLeaf_create_decoder(MimeObject* obj,
                                   MimeConverterOutputCallback output_fn) {
  MimeLeaf* leaf = (MimeLeaf*)obj;
  if (leaf->decoder_data) return 0;

  if (!obj->encoding) return 0;

  /* Raw mode: parent emits CTE headers, so bytes must stay encoded. */
  if (obj->options &&
      obj->options->format_out == nsMimeOutput::nsMimeMessageRaw &&
      obj->parent && obj->parent->output_p)
    return 0;

  MimeDecoderData* (*fn)(MimeConverterOutputCallback, MimeClosure) = nullptr;

  if (!PL_strcasecmp(obj->encoding, ENCODING_BASE64))
    fn = &MimeB64DecoderInit;
  else if (!PL_strcasecmp(obj->encoding, ENCODING_QUOTED_PRINTABLE)) {
    /* QP init takes the MimeObject for soft-line-break state. */
    leaf->decoder_data = MimeQPDecoderInit(
        output_fn, MimeClosure(MimeClosure::isMimeObject, obj), obj);
    return leaf->decoder_data ? 0 : MIME_OUT_OF_MEMORY;
  } else if (!PL_strcasecmp(obj->encoding, ENCODING_UUENCODE) ||
             !PL_strcasecmp(obj->encoding, ENCODING_UUENCODE2) ||
             !PL_strcasecmp(obj->encoding, ENCODING_UUENCODE3) ||
             !PL_strcasecmp(obj->encoding, ENCODING_UUENCODE4))
    fn = &MimeUUDecoderInit;
  else if (!PL_strcasecmp(obj->encoding, ENCODING_YENCODE))
    fn = &MimeYDecoderInit;

  if (fn) {
    leaf->decoder_data =
        fn(output_fn, MimeClosure(MimeClosure::isMimeObject, obj));
    if (!leaf->decoder_data) return MIME_OUT_OF_MEMORY;
  }

  return 0;
}

static int MimeLeaf_decode_buffer(const char* buffer, int32_t size,
                                  MimeObject* obj,
                                  MimeConverterOutputCallback output_fn) {
  MimeLeaf* leaf = (MimeLeaf*)obj;
  if (leaf->sizeSoFar == -1) leaf->sizeSoFar = 0;

  int status = MimeLeaf_create_decoder(obj, output_fn);
  if (status < 0) return status;

  /* Decrypt and Attach modes need raw encoded bytes; bypass decoder. */
  if (leaf->decoder_data && obj->options &&
      obj->options->format_out != nsMimeOutput::nsMimeMessageDecrypt &&
      obj->options->format_out != nsMimeOutput::nsMimeMessageAttach) {
    int outSize = 0;
    int rv = MimeDecoderWrite(leaf->decoder_data, buffer, size, &outSize);
    leaf->sizeSoFar += outSize;
    return rv;
  }

  int rv = output_fn(buffer, size, MimeClosure(MimeClosure::isMimeObject, obj));
  leaf->sizeSoFar += size;
  return rv;
}

/* Decode to compute size without output, for suppressed related children. */
int MimeLeaf_parse_buffer_for_size(const char* buffer, int32_t size,
                                   MimeObject* obj) {
  if (!obj || !mime_subclass_p(obj->clazz, (MimeObjectClass*)&mimeLeafClass))
    return 0;

  return MimeLeaf_decode_buffer(buffer, size, obj,
                                MimeLeaf_discard_decoded);
}

static int MimeLeaf_parse_line(const char* line, int32_t length,
                               MimeObject* obj) {
  NS_ERROR("MimeLeaf_parse_line shouldn't ever be called.");
  return -1;
}

static int MimeLeaf_close_decoder(MimeObject* obj) {
  MimeLeaf* leaf = (MimeLeaf*)obj;

  if (leaf->decoder_data) {
    int status = MimeDecoderDestroy(leaf->decoder_data, false);
    leaf->decoder_data = 0;
    return status;
  }

  return 0;
}

static int MimeLeaf_parse_eof(MimeObject* obj, bool abort_p) {
  MimeLeaf* leaf = (MimeLeaf*)obj;
  if (obj->closed_p) return 0;

  /* Close off the decoder, to cause it to give up any buffered data that
   it is still holding.
   */
  if (leaf->decoder_data) {
    int status = MimeLeaf_close_decoder(obj);
    if (status < 0) return status;
  }

  /* Now run the superclass's parse_eof, which will force out the line
   buffer (which we may have just repopulated, above.)
   */
  return ((MimeObjectClass*)&MIME_SUPERCLASS)->parse_eof(obj, abort_p);
}

static bool MimeLeaf_displayable_inline_p(MimeObjectClass* clazz,
                                          MimeHeaders* hdrs) {
  return true;
}

#undef MIME_SUPERCLASS
