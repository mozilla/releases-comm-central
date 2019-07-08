/*
 * Copyright (C) 2014 - Julien Voisin <julien.voisin@dustri.org>
 *                      David Goulet <dgoulet@ev0ke.net>
 *
 * This program is free software; you can redistribute it and/or modify it
 * under the terms of the GNU General Public License, version 2 only, as
 * published by the Free Software Foundation.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
 * more details.
 *
 * You should have received a copy of the GNU General Public License along with
 * this program; if not, write to the Free Software Foundation, Inc., 51
 * Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
 */

#include <stdlib.h>
#include <string.h>
#include <pthread.h>

#include <b64.h>
#include <tap/tap.h>
#include <proto.h>

GCRY_THREAD_OPTION_PTHREAD_IMPL;

#define NUM_TESTS 10

const char *alphanum_encoded =
	"?OTR:" "YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY3ODkwCg==" ".";
const char *alphanum_decoded =
	"abcdefghijklmnopqrstuvwxyz1234567890\n";

static void test_otrl_base64_otr_decode(void)
{
	int ret;
	unsigned char *bufp = NULL;
	size_t len = 0;

	/*
	 * Invalid decoding.
	 */

	ok(otrl_base64_otr_decode("hello", NULL, NULL) == -2,
			"Call with no prefix returned an error");
	ok(otrl_base64_otr_decode("?OTR:" "MTIzNAo=", NULL, NULL) == -2,
			"Call with no suffix returned an error");
	/* Message of size 0. */
	ret = otrl_base64_otr_decode("", &bufp, &len);
	ok(ret == -2 && bufp == NULL && len == 0,
			"Decode b64 with message of len 0");
	/*
	 * Valid decoding.
	 */

	/* Invalid chars are ignored */
	ok(otrl_base64_otr_decode("?OTR:invalid_base64_thing.", &bufp, &len) == 0
			&& len == 12, "Invalid b64 data");
	free(bufp);
	bufp = NULL;
	len = 0;

	ok(otrl_base64_otr_decode(alphanum_encoded, &bufp, &len) == 0,
			"Call with valid data successfull");
	ok(strcmp((const char*)bufp, alphanum_decoded) == 0
			&& len == 37, "Decoded valid b64 test vector with success");
	free(bufp);
	bufp = NULL;
	len = 0;

	/* Invalid base64 char. */
	ret = otrl_base64_otr_decode("?OTR:_*&?!!*\"().", &bufp, &len);
	ok(ret == 0 && bufp != NULL && len == 0,
			"Decode b64 with invalid b64 characters");
	free(bufp);
	bufp = NULL;
	len = 0;

}

static void test_otrl_base64_otr_encode(void)
{
	unsigned char *bufp = NULL;
	size_t len = 0;
	char *encoded;

	encoded = otrl_base64_otr_encode((const unsigned char *) alphanum_decoded,
			strlen(alphanum_decoded));

	ok(strcmp(encoded, alphanum_encoded) == 0,
			"Encoded b64 test vector with success");
	ok(otrl_base64_otr_decode(encoded, &bufp, &len) == 0,
			"Decoded previously encoded test vector");
	ok(memcmp(bufp, alphanum_decoded, len) == 0
		&& len == strlen(alphanum_decoded),
		"Decoded value is exact");
	free(bufp);
	free(encoded);
}

int main(int argc, char** argv)
{
	plan_tests(NUM_TESTS);

	gcry_control(GCRYCTL_SET_THREAD_CBS, &gcry_threads_pthread);
	OTRL_INIT;

	test_otrl_base64_otr_decode();
	test_otrl_base64_otr_encode();

	return 0;
}
