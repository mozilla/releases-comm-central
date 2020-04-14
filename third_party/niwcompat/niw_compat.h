/* niw_compat.h
 * Any copyright is dedicated to the Public Domain.
 * https://creativecommons.org/publicdomain/zero/1.0/
 */

#ifdef _WIN32

#ifndef _NIWCOMPAT_H
#define _NIWCOMPAT_H 1


#ifdef __cplusplus
extern "C" {
#endif

/* MS Header */
#include <stdio.h>
#include <io.h>
#include <direct.h>
#include <ctype.h>

typedef unsigned int ssize_t;

/* The POSIX names for the following are deprecated by MSVC */
#define write _write
#define unlink _unlink
#define rmdir _rmdir
#define read _read
#define lseek _lseek
#define isatty _isatty
#define getcwd _getcwd
#define dup2 _dup2
#define dup _dup
#define close _close
#define chdir _chdir

#define STDIN_FILENO 0
#define STDOUT_FILENO 1
#define STDERR_FILENO 2

/* String compare */
#ifndef strcasecmp
#define strcasecmp _stricmp
#endif
#define strncasecmp _strnicmp

/* From sys/stat.h */
#ifndef S_ISREG
#define S_ISREG(x) (_S_IFREG & x)
#endif

#ifndef S_ISDIR
#define S_ISDIR(x) (_S_IFDIR & x)
#endif

#define PATH_MAX FILENAME_MAX
#define MAXPATHLEN FILENAME_MAX

#ifdef __cplusplus
}
#endif


#endif    /* _NIWCOMPAT_H */
#endif
