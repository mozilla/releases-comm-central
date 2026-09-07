/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mimemapl.h"
#include "plstr.h"
#include "nsMimeTypes.h"

#define MIME_SUPERCLASS mimeMultipartClass
MimeDefClass(MimeMultipartAppleDouble, MimeMultipartAppleDoubleClass,
             mimeMultipartAppleDoubleClass, &MIME_SUPERCLASS);

static int MimeMultipartAppleDouble_parse_begin(MimeObject*);
static bool MimeMultipartAppleDouble_output_child_p(MimeObject*, MimeObject*);

static int MimeMultipartAppleDoubleClassInitialize(MimeObjectClass* oclass) {
  MimeMultipartClass* mclass = (MimeMultipartClass*)oclass;

  NS_ASSERTION(!oclass->class_initialized, "mime class not initialized");
  oclass->parse_begin = MimeMultipartAppleDouble_parse_begin;
  mclass->output_child_p = MimeMultipartAppleDouble_output_child_p;
  return 0;
}

static int MimeMultipartAppleDouble_parse_begin(MimeObject* obj) {
  /* #### This method is identical to MimeExternalObject_parse_begin
   which kinda s#$%s...
   */
  int status;

  status = ((MimeObjectClass*)&MIME_SUPERCLASS)->parse_begin(obj);
  if (status < 0) return status;

  /* If we're writing this object, and we're doing it in raw form, then
   now is the time to inform the backend what the type of this data is.
   */
  if (obj->output_p && obj->options && !obj->options->write_html_p &&
      !obj->options->state->first_data_written_p) {
    status = MimeObject_output_init(obj, 0);
    if (status < 0) return status;
    NS_ASSERTION(obj->options->state->first_data_written_p,
                 "first data not written");
  }

  return 0;
}

static bool MimeMultipartAppleDouble_output_child_p(MimeObject* obj,
                                                    MimeObject* child) {
  MimeContainer* cont = (MimeContainer*)obj;

  /* If this is the first child, and it's an application/applefile, then
   don't emit a link for it.  (There *should* be only two children, and
   the first one should always be an application/applefile.)
   */

  if (cont->nchildren >= 1 && cont->children[0] == child &&
      child->content_type &&
      !PL_strcasecmp(child->content_type, APPLICATION_APPLEFILE)) {
#ifdef XP_MACOSX
    if (obj->output_p && obj->options &&
        obj->options->write_html_p)  // output HTML
      return false;
#else
    /* if we are not on a Macintosh, don't emitte the resources fork at all. */
    return false;
#endif
  }

  return true;
}

#undef MIME_SUPERCLASS
