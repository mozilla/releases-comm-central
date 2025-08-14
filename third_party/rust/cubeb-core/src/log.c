#include <stdarg.h>
#include <stdio.h>

/** The maximum size of a log message, after having been formatted. */
#define CUBEB_LOG_MESSAGE_MAX_SIZE 256

void rust_write_formatted_msg(char* msg);

void cubeb_write_log(char const * fmt, ...) {
  va_list args;
  va_start(args, fmt);
  char msg[CUBEB_LOG_MESSAGE_MAX_SIZE];
  vsnprintf(msg, CUBEB_LOG_MESSAGE_MAX_SIZE, fmt, args);
  va_end(args);
  rust_write_formatted_msg(msg);
}

