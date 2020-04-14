/* sys/time.h
 * Any copyright is dedicated to the Public Domain.
 * https://creativecommons.org/publicdomain/zero/1.0/
 */

#ifndef _NIW_SYS_TIME_H
#define _NIW_SYS_TIME_H 1

#ifdef __cplusplus
extern "C" {
#endif

/* MS Win SDK Headers */
#include <sys/timeb.h> /* For _ftime_s */
#include <time.h>

#ifndef _TIMEVAL_DEFINED
#define _TIMEVAL_DEFINED
struct timeval {
  long tv_sec;
  long tv_usec;
};
#endif

int gettimeofday(struct timeval* tp, void* tzp) {
  struct _timeb timebuffer;

  if (tzp != NULL) {
    errno = EINVAL;
    return -1;
  }

  errno_t rv = _ftime_s(&timebuffer);
  if (rv != 0) {
    errno = rv;
    return -1;
  }
  tp->tv_sec = timebuffer.time;
  tp->tv_usec = timebuffer.millitm * 1000;

  return 0;
}

#ifdef __cplusplus
}
#endif

#endif
