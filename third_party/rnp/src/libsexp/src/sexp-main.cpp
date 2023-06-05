/**
 *
 * Copyright (c) 2022-2023, [Ribose Inc](https://www.ribose.com).
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
 *CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 *EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
 *PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR
 *BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER
 *IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 *
 * Original copyright
 *
 * SEXP implementation code sexp-main.c
 * Ron Rivest
 * 6/29/1997
 **/

#include <fstream>

#include <sexp/sexp.h>

using namespace sexp;

const char *help = "The program 'sexp' reads, parses, and prints out S-expressions.\n"
                   " INPUT:\n"
                   "   Input is normally taken from stdin, but this can be changed:\n"
                   "      -i filename      -- takes input from file instead.\n"
                   "      -p               -- prompts user for console input\n"
                   "   Input is normally parsed, but this can be changed:\n"
                   "      -s               -- treat input up to EOF as a single string\n"
                   " CONTROL LOOP:\n"
                   "   The main routine typically reads one S-expression, prints it out "
                   "again, \n"
                   "   and stops.  This may be modified:\n"
                   "      -x               -- execute main loop repeatedly until EOF\n"
                   " OUTPUT:\n"
                   "   Output is normally written to stdout, but this can be changed:\n"
                   "      -o filename      -- write output to file instead\n"
                   "   The output format is normally canonical, but this can be changed:\n"
                   "      -a               -- write output in advanced transport format\n"
                   "      -b               -- write output in base-64 output format\n"
                   "      -c               -- write output in canonical format\n"
                   "      -l               -- suppress linefeeds after output\n"
                   "   More than one output format can be requested at once.\n"
                   " There is normally a line-width of 75 on output, but:\n"
                   "      -w width         -- changes line width to specified width.\n"
                   "                          (0 implies no line-width constraint)\n"
                   " Running without switches implies: -p -a -b -c -x\n"
                   " Typical usage: cat certificate-file | sexp -a -x \n";

/*************************************************************************/
/* main(argc,argv)
 */
int main(int argc, char **argv)
{
    char *c;
    bool  swa = true, swb = true, swc = true, swp = true, sws = false, swx = true, swl = false;
    int   i;
    int   ret = -1;
    sexp_exception_t::set_interactive(true);
    std::ifstream *       ifs = nullptr;
    sexp_input_stream_t * is = nullptr;
    std::ofstream *       ofs = nullptr;
    sexp_output_stream_t *os = nullptr;
    std::string           ofname;
    std::string           ifname;
    try {
        std::shared_ptr<sexp_object_t> object;

        is = new sexp_input_stream_t(&std::cin);
        os = new sexp_output_stream_t(&std::cout);

        if (argc > 1)
            swa = swb = swc = swp = sws = swx = swl = false;
        for (i = 1; i < argc; i++) {
            c = argv[i];
            if (*c != '-')
                throw sexp_exception_t(
                  std::string("Unrecognized switch ") + c, sexp_exception_t::error, EOF);
            c++;
            if (*c == 'a')
                swa = true; /* advanced output */
            else if (*c == 'b')
                swb = true; /* base-64 output */
            else if (*c == 'c')
                swc = true;       /* canonical output */
            else if (*c == 'h') { /* help */
                std::cout << help;
                exit(0);
            } else if (*c == 'i') { /* input file */
                if (i + 1 < argc)
                    i++;
                ifs = new std::ifstream(argv[i], std::ifstream::binary);
                if (ifs->fail())
                    sexp_error(sexp_exception_t::error, "Can't open input file.", 0, 0, EOF);
                is->set_input(ifs);
                ifname = argv[i];
            } else if (*c == 'l')
                swl = true;       /* suppress linefeeds after output */
            else if (*c == 'o') { /* output file */
                if (i + 1 < argc)
                    i++;
                ofs = new std::ofstream(argv[i], std::ifstream::binary);
                if (ofs->fail())
                    sexp_error(sexp_exception_t::error, "Can't open output file.", 0, 0, EOF);
                os->set_output(ofs);
                ofname = argv[i];
            } else if (*c == 'p')
                swp = true; /* prompt for input */
            else if (*c == 's')
                sws = true;       /* treat input as one big string */
            else if (*c == 'w') { /* set output width */
                if (i + 1 < argc)
                    i++;
                os->set_max_column(atoi(argv[i]));
            } else if (*c == 'x')
                swx = true; /* execute repeatedly */
            else
                throw sexp_exception_t(
                  std::string("Unrecognized switch ") + argv[i], sexp_exception_t::error, EOF);
        }

        if (swa == false && swb == false && swc == false)
            swc = true; /* must have some output format! */

        /* main loop */
        if (swp == 0)
            is->get_char();
        else
            is->set_next_char(-2); /* this is not EOF */
        while (is->get_next_char() != EOF) {
            if (swp) {
                if (ifname.empty())
                    std::cout << "Input:";
                else
                    std::cout << "Reading input from " << ifname;
                std::cout << std::endl;
                std::cout.flush();
            }

            is->set_byte_size(8);
            if (is->get_next_char() == -2)
                is->get_char();

            is->skip_white_space();
            if (is->get_next_char() == EOF)
                break;

            object = sws ? is->scan_to_eof() : is->scan_object();

            if (swp)
                std::cout << std::endl;

            if (swc) {
                if (swp) {
                    if (ofname.empty())
                        std::cout << "Canonical output:" << std::endl;
                    else
                        std::cout << "Writing canonical output to '" << ofname << "'";
                }
                object->print_canonical(os);
                if (!swl) {
                    std::cout << std::endl;
                }
            }

            if (swb) {
                if (swp) {
                    if (ofname.empty())
                        std::cout << "Base64 (of canonical) output:" << std::endl;
                    else
                        std::cout << "Writing base64 (of canonical) output to '" << ofname
                                  << "'";
                }
                os->set_output(ofs ? ofs : &std::cout)->print_base64(object);
                if (!swl) {
                    std::cout << std::endl;
                    std::cout.flush();
                }
            }

            if (swa) {
                if (swp) {
                    if (ofname.empty())
                        std::cout << "Advanced transport output:" << std::endl;
                    else
                        std::cout << "Writing advanced transport output to '" << ofname << "'";
                }
                os->set_output(ofs ? ofs : &std::cout)->print_advanced(object);
                if (!swl) {
                    std::cout << std::endl;
                    std::cout.flush();
                }
            }

            if (!swx)
                break;
            if (!swp)
                is->skip_white_space();
            else if (!swl) {
                std::cout << std::endl;
                std::cout.flush();
            }
        }
        ret = 0;
    } catch (sexp_exception_t &e) {
        std::cout << e.what() << std::endl;
    } catch (...) {
        std::cout << "UNEXPECTED ERROR" << std::endl;
    }
    if (is)
        delete is;
    if (ifs)
        delete ifs;
    if (os)
        delete os;
    if (ofs)
        delete ofs;
    return ret;
}