/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Most of this code is copied from mimethpl; see there for source comments.
   If you find a bug here, check that class, too.
*/

/* The MimeInlineTextHTMLSanitized class cleans up HTML

   This removes offending HTML features that have no business in mail.
   It is a low-level stop gap for many classes of attacks,
   and intended for security conscious users.
   Paranoia is a feature here, and has served very well in practice.

   It has already prevented countless serious exploits.

   It pushes the HTML that we get from the sender of the message
   through a sanitizer (nsTreeSanitizer), which lets only allowed tags through.
   With the appropriate configuration, this protects from most of the
   security and visual-formatting problems that otherwise usually come with HTML
   (and which partly gave HTML in email the bad reputation that it has).

   However, due to the parsing and serializing (and later parsing again)
   required, there is an inherent, significant performance hit, when doing the
   santinizing here at the MIME / HTML source level. But users of this class
   will most likely find it worth the cost.
 */

#include "mimethsa.h"
#include "prmem.h"
#include "prlog.h"
#include "msgCore.h"
#include "mimemoz2.h"
#include "nsString.h"
#include "mimethtm.h"

#define MIME_SUPERCLASS mimeInlineTextHTMLClass
MimeDefClass(MimeInlineTextHTMLSanitized, MimeInlineTextHTMLSanitizedClass,
             mimeInlineTextHTMLSanitizedClass, &MIME_SUPERCLASS);

static int MimeInlineTextHTMLSanitized_parse_line(const char*, int32_t,
                                                  MimeObject*);
static int MimeInlineTextHTMLSanitized_parse_begin(MimeObject* obj);
static int MimeInlineTextHTMLSanitized_parse_eof(MimeObject*, bool);
static void MimeInlineTextHTMLSanitized_finalize(MimeObject* obj);

static int MimeInlineTextHTMLSanitizedClassInitialize(
    MimeInlineTextHTMLSanitizedClass* clazz) {
  MimeObjectClass* oclass = (MimeObjectClass*)clazz;
  NS_ASSERTION(!oclass->class_initialized, "problem with superclass");
  oclass->parse_line = MimeInlineTextHTMLSanitized_parse_line;
  oclass->parse_begin = MimeInlineTextHTMLSanitized_parse_begin;
  oclass->parse_eof = MimeInlineTextHTMLSanitized_parse_eof;
  oclass->finalize = MimeInlineTextHTMLSanitized_finalize;

  return 0;
}

static int MimeInlineTextHTMLSanitized_parse_begin(MimeObject* obj) {
  MimeInlineTextHTMLSanitized* me = (MimeInlineTextHTMLSanitized*)obj;
  me->complete_buffer = new nsString();
  int status = ((MimeObjectClass*)&MIME_SUPERCLASS)->parse_begin(obj);
  if (status < 0) return status;

  return 0;
}

static int MimeInlineTextHTMLSanitized_parse_eof(MimeObject* obj,
                                                 bool abort_p) {
  if (obj->closed_p) return 0;
  int status = ((MimeObjectClass*)&MIME_SUPERCLASS)->parse_eof(obj, abort_p);
  if (status < 0) return status;
  MimeInlineTextHTMLSanitized* me = (MimeInlineTextHTMLSanitized*)obj;

  // We have to cache all lines and parse the whole document at once.
  // There's a useful sounding function parseFromStream(), but it only allows
  // XML mimetypes, not HTML. Methinks that's because the HTML soup parser needs
  // the entire doc to make sense of the gibberish that people write.
  if (!me || !me->complete_buffer) return 0;

  nsString& cb = *(me->complete_buffer);
  if (cb.IsEmpty()) return 0;
  nsString sanitized;

  // Sanitize.
  HTMLSanitize(cb, sanitized);

  // Write it out.
  NS_ConvertUTF16toUTF8 resultCStr(sanitized);
  MimeInlineTextHTML_insert_lang_div(obj, resultCStr);
  // Call to MimeInlineTextHTML_remove_plaintext_tag() not needed since
  // sanitization already removes that tag.
  status =
      ((MimeObjectClass*)&MIME_SUPERCLASS)
          ->parse_line(resultCStr.BeginWriting(), resultCStr.Length(), obj);
  cb.Truncate();
  return status;
}

void MimeInlineTextHTMLSanitized_finalize(MimeObject* obj) {
  MimeInlineTextHTMLSanitized* me = (MimeInlineTextHTMLSanitized*)obj;

  if (me && me->complete_buffer) {
    obj->clazz->parse_eof(obj, false);
    delete me->complete_buffer;
    me->complete_buffer = NULL;
  }

  ((MimeObjectClass*)&MIME_SUPERCLASS)->finalize(obj);
}

static int MimeInlineTextHTMLSanitized_parse_line(const char* line,
                                                  int32_t length,
                                                  MimeObject* obj) {
  MimeInlineTextHTMLSanitized* me = (MimeInlineTextHTMLSanitized*)obj;

  if (!me || !(me->complete_buffer)) return -1;

  nsCString linestr(line, length);
  NS_ConvertUTF8toUTF16 line_ucs2(linestr.get());
  if (length && line_ucs2.IsEmpty()) CopyASCIItoUTF16(linestr, line_ucs2);
  (me->complete_buffer)->Append(line_ucs2);

  return 0;
}
