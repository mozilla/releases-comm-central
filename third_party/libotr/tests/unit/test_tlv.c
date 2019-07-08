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

#include <proto.h>
#include <tlv.h>

#include <tap/tap.h>

GCRY_THREAD_OPTION_PTHREAD_IMPL;

#define NUM_TESTS 11

static void test_otrl_tlv_new()
{
	const unsigned short type = OTRL_TLV_SMP1Q;
	const char *data = "This is some test data";
	const unsigned short len = strlen(data);

	OtrlTLV* tlv = otrl_tlv_new(type, len, (unsigned char*)data);
	ok(tlv->type == type &&
			tlv->len == len &&
			memcmp(tlv->data, data, len) == 0 &&
			tlv->data[len] == '\0' &&
			tlv->next == NULL,
			"TLV created with success");
	otrl_tlv_free(tlv);
}

static void test_otrl_tlv_parse()
{
	const unsigned char serialized1[] =
		{'\x01', '\x02', '\x00', '\x03', '1', '2', '3'};
	const unsigned char serialized2[] = {'\x02', '\x04', '\x00', '\x00'};
	const unsigned char serialized3[] =
		{'\x04', '\x02', '\x00', '\x03', '1', '2', '3',
		'\x02', '\x02', '\xff', '\xff', '1', '3', '3', '7'};
	const unsigned char serialized4[] =
		{'\x04', '\x02', '\x00', '\x03', '1', '2', '3',
		'\x02', '\x02', '\x00', '\x04', '1', '3', '3', '7'};

	OtrlTLV *tlv1 = otrl_tlv_parse(serialized1, sizeof(serialized1));
	OtrlTLV *tlv2 = otrl_tlv_parse(serialized2, sizeof(serialized2));
	OtrlTLV *tlv3 = otrl_tlv_parse(serialized3, sizeof(serialized3));
	OtrlTLV *tlv4 = otrl_tlv_parse(serialized4, sizeof(serialized4));

	ok(tlv1->type == 258 &&
			tlv1->len == 3 &&
			tlv1->next == NULL &&
			memcmp(tlv1->data, "123", tlv1->len) == 0 &&
			tlv1->data[tlv1->len] == 0,
			"Single-TLV chain constructed with success");
	otrl_tlv_free(tlv1);

	ok(tlv2->type == 516 &&
			tlv2->len == 0 &&
			tlv2->next == NULL,
			"tlv2 chain with no data constructed with success");
	otrl_tlv_free(tlv2);

	ok(tlv3->type == 1026 &&
			tlv3->len == 3 &&
			memcmp(tlv3->data, "123", tlv3->len) == 0 &&
			tlv3->data[tlv3->len] == 0 &&
			tlv3->next == NULL,
			"tlv3 chain with overflow constructed with success");
	otrl_tlv_free(tlv3);

	ok(tlv4->type == 1026 &&
			tlv4->len == 3 &&
			memcmp(tlv4->data, "123", tlv4->len) == 0 &&
			tlv4->data[tlv4->len] == 0 &&
			tlv4->next != NULL,
			"First part of the 2-part tlv chain build");

	ok(tlv4->next != NULL &&
			tlv4->next->type == 514 &&
			tlv4->next->len == 4 &&
			memcmp(tlv4->next->data, "1337", tlv4->next->len) == 0 &&
			tlv4->next->data[tlv4->next->len] == 0 &&
			tlv4->next->next == NULL,
			"Second part of the 2-part tlv chain build");
	otrl_tlv_free(tlv4);
}

static void test_otrl_tlv_seriallen()
{
	const unsigned char serialized[] =
		{'\x04', '\x02', '\x00', '\x03', '1', '2', '3',
		'\x02', '\x02', '\x00', '\x04', '1', '3', '3', '7'};
	OtrlTLV* tlv = otrl_tlv_parse(serialized, sizeof(serialized));
	ok(otrl_tlv_seriallen(tlv) == 4 + 3 + 4 + 4,
			"Size correctly guessed");
	otrl_tlv_free(tlv);
}

static void test_otrl_tlv_serialize()
{
	const unsigned char serialized[] =
		{'\x04', '\x02', '\x00', '\x03', '1', '2', '3',
		'\x02', '\x02', '\x00', '\x04', '1', '3', '3', '7'};
	OtrlTLV *tlv = otrl_tlv_parse(serialized, sizeof(serialized));
	unsigned char *buf = malloc(otrl_tlv_seriallen(tlv));
	otrl_tlv_serialize(buf, tlv);
	ok(memcmp(serialized, buf, sizeof(serialized)) == 0,
			"tlv correctly serialized");
	free(tlv);

	tlv = otrl_tlv_parse(buf, sizeof(serialized));
	otrl_tlv_serialize(buf, tlv);
	ok(memcmp(serialized, buf, sizeof(serialized)) == 0,
			"tlv correctly unserialized and serialized again");
	otrl_tlv_free(tlv);
}

static void test_otrl_tlv_find()
{
	const unsigned char serialized[] =
		{'\x04', '\x02', '\x00', '\x03', '1', '2', '3',
		'\x02', '\x02', '\x00', '\x04', '1', '3', '3', '7',
		'\x01', '\x03', '\x0', '\x01', 'A',
		'\x01', '\x02', '\x0', '\x01', 'B'};
	OtrlTLV *tlv = otrl_tlv_parse(serialized, sizeof(serialized));
	OtrlTLV *result = otrl_tlv_find(tlv, (1<<8) + 3);
	ok(result == tlv->next->next, "TLV found");

	result = otrl_tlv_find(tlv, 7);
	ok(result == NULL, "Unexistent TLV not found");

	otrl_tlv_free(tlv);
}

int main(int argc, char **argv)
{
	plan_tests(NUM_TESTS);

	gcry_control(GCRYCTL_SET_THREAD_CBS, &gcry_threads_pthread);
	OTRL_INIT;

	test_otrl_tlv_new();
	test_otrl_tlv_parse();
	test_otrl_tlv_seriallen();
	test_otrl_tlv_serialize();
	test_otrl_tlv_find();

	return 0;
}
