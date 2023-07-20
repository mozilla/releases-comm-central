/**
 *
 * Copyright (c) 2022, [Ribose Inc](https://www.ribose.com).
 * All rights reserved.
 * This file is a part of RNP sexp library
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * ``AS IS'' AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED
 * TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
 * PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDERS OR
 * CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 * EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
 * PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS;
 * OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
 * WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR
 * OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF
 * ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 */

#pragma once

#include <cstdint>
#include <exception>
#include <iostream>
#include <string>

namespace sexp {

class sexp_exception_t : public std::exception {
  public:
    enum severity { error = 0, warning = 1 };

  protected:
    static severity verbosity;
    static bool     interactive;

    int         position; // May be EOF aka -1
    severity    level;
    std::string message;

  public:
    sexp_exception_t(std::string error_message,
                     severity    error_level,
                     int         error_position,
                     const char *prefix = "SEXP")
        : position{error_position}, level{error_level},
          message{format(prefix, error_message, error_level, error_position)} {};

    static std::string format(std::string prf,
                              std::string message,
                              severity    level,
                              int         position);

    static bool shall_throw(severity level) { return level == error || verbosity != error; };
    virtual const char *what(void) const throw() { return message.c_str(); };
    severity            get_level(void) const { return level; };
    uint32_t            get_position(void) const { return position; };
    static severity     get_verbosity(void) { return verbosity; };
    static bool         is_interactive(void) { return interactive; };
    static void         set_verbosity(severity new_verbosity) { verbosity = new_verbosity; };
    static void set_interactive(bool new_interactive) { interactive = new_interactive; };
};

void sexp_error(
  sexp_exception_t::severity level, const char *msg, size_t c1, size_t c2, int pos);

} // namespace sexp
