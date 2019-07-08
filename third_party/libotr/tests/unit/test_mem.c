/*
 * Copyright (C) 2014 - Julien Voisin <julien.voisin@dustri.org>
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

#include <gcrypt.h>
#include <pthread.h>

#include <mem.h>
#include <proto.h>

#include <tap/tap.h>

GCRY_THREAD_OPTION_PTHREAD_IMPL;

#define NUM_TESTS 5

static void test_otrl_mem_differ(void)
{
	const unsigned char buf1[] = "\x00" "12" "\x00" "34";
	const unsigned char buf2[] = "\x00" "13" "\x00" "34";
	const unsigned char buf3[] = "\x00" "13" "\x00" "345";

	ok(otrl_mem_differ(buf1, buf1, sizeof(buf1)) == 0,
			"Identical buf are identical");
	ok(otrl_mem_differ(buf1, buf2, sizeof(buf1)) == 1,
			"buf1 and buf2 are not identical");
	ok(otrl_mem_differ(buf2, buf3, sizeof(buf1)) == 1,
			"buf1 and buf2 are not identical");
	ok(otrl_mem_differ(buf1, NULL, 0) == 0,
			"buf1 and NULL are identical");
	ok(otrl_mem_differ(NULL, NULL, 0) == 0,
			"NULL and NULL are identical");
}

int main(int argc, char **argv)
{
	plan_tests(NUM_TESTS);

	gcry_control(GCRYCTL_SET_THREAD_CBS, &gcry_threads_pthread);
	OTRL_INIT;

	test_otrl_mem_differ();

	return 0;
}
