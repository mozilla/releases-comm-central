/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * This Original Code has been modified by IBM Corporation. Modifications made
 * by IBM described herein are Copyright (c) International Business Machines
 * Corporation, 2000. Modifications to Mozilla code or documentation identified
 * per MPL Section 3.3
 *
 * Date             Modified by     Description of modification
 * 04/20/2000       IBM Corp.      OS/2 VisualAge build.
 */
/*
 * mimebuf.c -  libmsg like buffer handling routines for libmime
 */
#include "mimebuf.h"

#include "mozilla/CheckedInt.h"
#include "prmem.h"
#include "plstr.h"
#include "prlog.h"
#include "msgCore.h"
#include "nsMimeStringResources.h"
#include "mimeobj.h"

extern "C" int mime_GrowBuffer(uint32_t desired_size, uint32_t quantum,
                               char** buffer, int32_t* size) {
  /* A negative *size means an earlier growth wrapped it. Refuse, rather than
     let the comparison below cast it back to a huge unsigned value, conclude
     no growth is needed and report success. */
  if (*size < 0) return MIME_OUT_OF_MEMORY;

  if ((uint32_t)*size <= desired_size) {
    char* new_buf;
    uint32_t increment = desired_size - (uint32_t)*size;
    if (increment < quantum) /* always grow by a minimum of N bytes */
      increment = quantum;

    /* The size is tracked in an int32_t, so refuse what it cannot hold. */
    mozilla::CheckedInt<int32_t> new_size =
        mozilla::CheckedInt<int32_t>(*size) + increment;
    if (!new_size.isValid()) return MIME_OUT_OF_MEMORY;

    new_buf = (*buffer ? (char*)PR_Realloc(*buffer, new_size.value())
                       : (char*)PR_MALLOC(new_size.value()));
    if (!new_buf) return MIME_OUT_OF_MEMORY;
    *buffer = new_buf;
    *size = new_size.value();
  }
  return 0;
}

/* `size` is the allocated size of `buf`. It needs two bytes beyond the line:
   one for growing the terminator from LF to CRLF and one for the final NUL.
   XXX: Every caller of mime_LineBuffer() passes true for `convert_newlines_p`,
   so it could be removed. */
static int convert_and_send_buffer(char* buf, int length, int32_t size,
                                   bool convert_newlines_p,
                                   int32_t (*per_line_fn)(const char* line,
                                                          int32_t line_length,
                                                          MimeObject* closure),
                                   MimeObject* closure) {
  /* mime_LineBuffer() only sends lines ending in LF or CRLF. Convert the line
     terminator to the native form. */
  NS_ASSERTION(
      buf && length > 0 && length <= size - 2 && buf[length - 1] == '\n',
      "line should end in LF and leave room to grow");
  if (!buf || length <= 0 || length > size - 2 || buf[length - 1] != '\n') {
    return -1;
  }

  if (convert_newlines_p) {
#if (MSG_LINEBREAK_LEN == 1)
    if (length >= 2 && buf[length - 2] == '\r') {
      /* CRLF -> LF */
      buf[length - 2] = MSG_LINEBREAK[0];
      length--;
    }
#else
    if (length >= 2 && buf[length - 2] != '\r') {
      /* LF -> CRLF */
      buf[length - 1] = MSG_LINEBREAK[0];
      buf[length] = MSG_LINEBREAK[1];
      length++;
    }
#endif
  }

  /* The conversion above moves the end of the line, so the NUL that
     mime_LineBuffer() placed at the old end is now either stale data inside
     the line or gone entirely. Re-terminate, so that a per_line_fn scanning
     forward from `buf` cannot walk past `buf + length`. */
  buf[length] = '\0';

  return (*per_line_fn)(buf, length, closure);
}

extern "C" int mime_LineBuffer(const char* net_buffer, int32_t net_buffer_size,
                               char** bufferP, int32_t* buffer_sizeP,
                               int32_t* buffer_fpP, bool convert_newlines_p,
                               int32_t (*per_line_fn)(const char* line,
                                                      int32_t line_length,
                                                      MimeObject* closure),
                               MimeObject* closure) {
  int status = 0;
  while (net_buffer_size > 0) {
    const char* net_buffer_end = net_buffer + net_buffer_size;
    const char* newline = 0;
    const char* s;

    /* A line ends at LF, which also covers CRLF. A bare CR is not a line
       break (RFC 5322 section 2.2), so a header can't be split by one. */
    for (s = net_buffer; s < net_buffer_end; s++) {
      if (*s == '\n') {
        newline = s + 1;
        break;
      }
    }

    /* Ensure room in the net_buffer and append some or all of the current
     chunk of data to it. */
    {
      const char* end = (newline ? newline : net_buffer_end);
      /* Two bytes of slack, not one: convert_and_send_buffer() may grow the
         line by one when converting the terminator, and still needs to be
         able to NUL-terminate one past the result. */
      mozilla::CheckedInt<int32_t> desired_size =
          mozilla::CheckedInt<int32_t>(*buffer_fpP) + (end - net_buffer) + 2;
      if (!desired_size.isValid()) return MIME_OUT_OF_MEMORY;

      if (desired_size.value() >= *buffer_sizeP) {
        status =
            mime_GrowBuffer(desired_size.value(), 1024, bufferP, buffer_sizeP);
        if (status < 0) return status;
      }
      memcpy((*bufferP) + (*buffer_fpP), net_buffer, (end - net_buffer));
      (*buffer_fpP) += (end - net_buffer);
      (*bufferP)[*buffer_fpP] = '\0';
    }

    /* Now *bufferP contains either a complete line, or as complete
     a line as we have read so far.

     If we have a line, process it, and then remove it from `*bufferP'.
     Then go around the loop again, until we drain the incoming data.
     */
    if (!newline) return 0;

    status = convert_and_send_buffer(*bufferP, *buffer_fpP, *buffer_sizeP,
                                     convert_newlines_p, per_line_fn, closure);
    if (status < 0) return status;

    net_buffer_size -= (newline - net_buffer);
    net_buffer = newline;
    (*buffer_fpP) = 0;
  }
  return 0;
}
