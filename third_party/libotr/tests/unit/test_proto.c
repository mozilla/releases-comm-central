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

#include <limits.h>
#include <pthread.h>

#include <proto.h>

#include <tap/tap.h>

GCRY_THREAD_OPTION_PTHREAD_IMPL;

#define NUM_TESTS 48

static ConnContext *new_context(const char *user, const char *accountname,
		const char *protocol)
{
	ConnContext *context;
	OtrlSMState *smstate;

	context = malloc(sizeof(ConnContext));

	context->username = strdup(user);
	context->accountname = strdup(accountname);
	context->protocol = strdup(protocol);

	context->msgstate = OTRL_MSGSTATE_PLAINTEXT;
	otrl_auth_new(context);

	smstate = malloc(sizeof(OtrlSMState));
	otrl_sm_state_new(smstate);
	context->smstate = smstate;

	context->our_instance = 0;
	context->their_instance = OTRL_INSTAG_MASTER;
	context->fingerprint_root.fingerprint = NULL;
	context->fingerprint_root.context = context;
	context->fingerprint_root.next = NULL;
	context->fingerprint_root.tous = NULL;
	context->active_fingerprint = NULL;
	memset(context->sessionid, 0, 20);
	context->sessionid_len = 0;
	context->protocol_version = 0;
	context->otr_offer = OFFER_NOT;
	context->app_data = NULL;
	context->app_data_free = NULL;
	context->context_priv = otrl_context_priv_new();
	context->next = NULL;
	context->m_context = context;
	context->recent_rcvd_child = NULL;
	context->recent_sent_child = NULL;
	context->recent_child = NULL;

	return context;
}

static void test_otrl_proto_whitespace_bestversion(void)
{
	unsigned int ret;
	const char *start, *end;
	const char *test1 = OTRL_MESSAGE_TAG_BASE OTRL_MESSAGE_TAG_V2;
	const char *test2 = OTRL_MESSAGE_TAG_BASE OTRL_MESSAGE_TAG_V3;
	const char *test3 = OTRL_MESSAGE_TAG_BASE "foobar";

	ret = otrl_proto_whitespace_bestversion(test1, &start, &end,
			OTRL_POLICY_ALLOW_V2);
	ok(ret == 2, "Best version whitespace v2");

	ret = otrl_proto_whitespace_bestversion(test1, &start, &end,
			OTRL_POLICY_ALLOW_V2 | OTRL_POLICY_ALLOW_V3);
	ok(ret == 2, "Best version whitespace v2 dual policy");

	ret = otrl_proto_whitespace_bestversion(test2, &start, &end,
			OTRL_POLICY_ALLOW_V3);
	ok(ret == 3, "Best version whitespace v3");

	ret = otrl_proto_whitespace_bestversion(test2, &start, &end,
			OTRL_POLICY_ALLOW_V2 | OTRL_POLICY_ALLOW_V3);
	ok(ret == 3, "Best version whitespace v3 dual policy");

	ret = otrl_proto_whitespace_bestversion(test3, &start, &end,
			OTRL_POLICY_ALLOW_V2 | OTRL_POLICY_ALLOW_V3);
	ok(ret == 0, "Best version whitespace invalid");
}

static void test_otrl_proto_query_bestversion(void)
{
	const char *query2 = "?OTRv2?\n<b>alice</b> has requested an "
		"<a href=\"https://otr.cypherpunks.ca/\">Off-the-Record "
		"private conversation</a>.  However, you do not have a plugin "
		"to support that.\nSee <a href=\"https://otr.cypherpunks.ca/\">"
		"https://otr.cypherpunks.ca/</a> for more information.";

	const char *query23 = "?OTRv23?\n<b>alice</b> has requested an "
		"<a href=\"https://otr.cypherpunks.ca/\">Off-the-Record "
		"private conversation</a>.  However, you do not have a plugin "
		"to support that.\nSee <a href=\"https://otr.cypherpunks.ca/\">"
		"https://otr.cypherpunks.ca/</a> for more information.";

	const char *query3 = "?OTRv3?\n<b>alice</b> has requested an "
		"<a href=\"https://otr.cypherpunks.ca/\">Off-the-Record "
		"private conversation</a>.  However, you do not have a plugin "
		"to support that.\nSee <a href=\"https://otr.cypherpunks.ca/\">"
		"https://otr.cypherpunks.ca/</a> for more information.";

	ok(otrl_proto_query_bestversion(query2, OTRL_POLICY_ALLOW_V2) == 2,
			"The best from query2 is 2");
	ok(otrl_proto_query_bestversion(query3, OTRL_POLICY_ALLOW_V3) == 3,
			"The best from query3 is 3");
	ok(otrl_proto_query_bestversion(query23, OTRL_POLICY_ALLOW_V2) == 2,
			"The best from query23 is 2");
	ok(otrl_proto_query_bestversion(query23, OTRL_POLICY_ALLOW_V3) == 3,
			"The best from query23 is 3");
}

static void test_otrl_proto_default_query_msg(void)
{
	const char *expected2 = "?OTRv2?\n<b>alice</b> has requested an "
		"<a href=\"https://otr.cypherpunks.ca/\">Off-the-Record "
		"private conversation</a>.  However, you do not have a plugin "
		"to support that.\nSee <a href=\"https://otr.cypherpunks.ca/\">"
		"https://otr.cypherpunks.ca/</a> for more information.";

	const char *expected23 = "?OTRv23?\n<b>alice</b> has requested an "
		"<a href=\"https://otr.cypherpunks.ca/\">Off-the-Record "
		"private conversation</a>.  However, you do not have a plugin "
		"to support that.\nSee <a href=\"https://otr.cypherpunks.ca/\">"
		"https://otr.cypherpunks.ca/</a> for more information.";

	const char *expected3 = "?OTRv3?\n<b>alice</b> has requested an "
		"<a href=\"https://otr.cypherpunks.ca/\">Off-the-Record "
		"private conversation</a>.  However, you do not have a plugin "
		"to support that.\nSee <a href=\"https://otr.cypherpunks.ca/\">"
		"https://otr.cypherpunks.ca/</a> for more information.";

	const char *msg2 = otrl_proto_default_query_msg("alice",
			OTRL_POLICY_ALLOW_V2);
	const char *msg23 = otrl_proto_default_query_msg("alice",
			OTRL_POLICY_ALLOW_V2 | OTRL_POLICY_ALLOW_V3);
	const char *msg3 = otrl_proto_default_query_msg("alice",
			OTRL_POLICY_ALLOW_V3);
	ok(strcmp(expected2, msg2) == 0, "OTRv2 default query message is valid");
	ok(strcmp(expected23, msg23) == 0,
			"OTRv23 default query message is valid");
	ok(strcmp(expected3, msg3) == 0, "OTRv3 default query message is valid");
}

void test_otrl_init(void)
{
	extern unsigned int otrl_api_version;

	const unsigned int expected = rand();
	otrl_api_version = expected;
	ok(otrl_init(OTRL_VERSION_MAJOR+1, 0, 0) == gcry_error(GPG_ERR_INV_VALUE),
			"Too recent major version");
	ok(otrl_api_version == expected, "Api number unchanged");

	ok(otrl_init(OTRL_VERSION_MAJOR-1, 0, 0) == gcry_error(GPG_ERR_INV_VALUE),
			"Too old major version");
	ok(otrl_api_version == expected, "Api number unchanged");

	ok(otrl_init(OTRL_VERSION_MAJOR, OTRL_VERSION_MINOR+1, 0)
			== gcry_error(GPG_ERR_INV_VALUE),
			"Too recent minor version");
	ok(otrl_api_version = expected, "Api number unchanged");

	ok(otrl_init(OTRL_VERSION_MAJOR, OTRL_VERSION_MINOR?OTRL_VERSION_MINOR-1:0,
			OTRL_VERSION_SUB) == gcry_error(GPG_ERR_NO_ERROR),
			"Inferior minor version");
	ok(otrl_api_version = expected, "Api number unchanged");

	otrl_api_version = 0;

	ok(otrl_init(OTRL_VERSION_MAJOR, OTRL_VERSION_MINOR, OTRL_VERSION_SUB)
			== gcry_error(GPG_ERR_NO_ERROR), "Exact version");
	ok(otrl_api_version == (
				(OTRL_VERSION_MAJOR << 16) |
				(OTRL_VERSION_MINOR << 8) |
				(OTRL_VERSION_SUB)
				), "Api version set for exact version");
}

static void test_otrl_proto_message_type(void)
{
	OtrlMessageType ret;

	const char *test1 = "This is plaintext";
	ret = otrl_proto_message_type(test1);
	ok(ret == OTRL_MSGTYPE_NOTOTR, "Proto message type is not OTR");

	const char *test2 = OTRL_MESSAGE_TAG_BASE "This is plaintext";
	ret = otrl_proto_message_type(test2);
	ok(ret == OTRL_MSGTYPE_TAGGEDPLAINTEXT,
			"Proto message type is tagged plaintext");

	const char *test3 = "?OTR:AAIC";
	ret = otrl_proto_message_type(test3);
	ok(ret == OTRL_MSGTYPE_DH_COMMIT, "Proto message type v2 is dh commit");

	const char *test4 = "?OTR:AAMC";
	ret = otrl_proto_message_type(test4);
	ok(ret == OTRL_MSGTYPE_DH_COMMIT, "Proto message type v3 is dh commit");

	const char *test5 = "?OTR:AAIK";
	ret = otrl_proto_message_type(test5);
	ok(ret == OTRL_MSGTYPE_DH_KEY, "Proto message type v2 is DH key");

	const char *test6 = "?OTR:AAMK";
	ret = otrl_proto_message_type(test6);
	ok(ret == OTRL_MSGTYPE_DH_KEY, "Proto message type v3 is DH key");

	const char *test7 = "?OTR:AAIR";
	ret = otrl_proto_message_type(test7);
	ok(ret == OTRL_MSGTYPE_REVEALSIG, "Proto message type v2 is revealsig");

	const char *test8 = "?OTR:AAMR";
	ret = otrl_proto_message_type(test8);
	ok(ret == OTRL_MSGTYPE_REVEALSIG, "Proto message type v3 is revealsig");

	const char *test9 = "?OTR:AAIS";
	ret = otrl_proto_message_type(test9);
	ok(ret == OTRL_MSGTYPE_SIGNATURE, "Proto message type v2 is a signature");

	const char *test10 = "?OTR:AAMS";
	ret = otrl_proto_message_type(test10);
	ok(ret == OTRL_MSGTYPE_SIGNATURE, "Proto message type v3 is a signature");

	const char *test11 = "?OTR:AAID";
	ret = otrl_proto_message_type(test11);
	ok(ret == OTRL_MSGTYPE_DATA, "Proto message type v2 is a data msg");

	const char *test12 = "?OTR:AAMD";
	ret = otrl_proto_message_type(test12);
	ok(ret == OTRL_MSGTYPE_DATA, "Proto message type v3 is a data msg");

	const char *test13 = "?OTR?";
	ret = otrl_proto_message_type(test13);
	ok(ret == OTRL_MSGTYPE_QUERY, "Proto message type is a query");

	const char *test14 = "?OTR?v";
	ret = otrl_proto_message_type(test14);
	ok(ret == OTRL_MSGTYPE_QUERY, "Proto message type is a query");

	const char *test15 = "?OTR Error:";
	ret = otrl_proto_message_type(test15);
	ok(ret == OTRL_MSGTYPE_ERROR, "Proto message type is an error");

	const char *test16 = "?OTR: Please verify me";
	ret = otrl_proto_message_type(test16);
	ok(ret == OTRL_MSGTYPE_UNKNOWN, "Proto message type is unknown");

	const char *test17 = "?OTR:AAMA";
	ret = otrl_proto_message_type(test17);
	ok(ret == OTRL_MSGTYPE_UNKNOWN, "Proto message type is unknown");
}

static void test_otrl_proto_message_version(void)
{
	int ret;

	const char *test1 = "?OTR:AAI";
	ret = otrl_proto_message_version(test1);
	ok(ret == 2, "Protocol message version is 2");

	const char *test2 = "?OTR:AAM";
	ret = otrl_proto_message_version(test2);
	ok(ret == 3, "Protocol message version is 3");

	const char *test3 = "?OTR:BLAH";
	ret = otrl_proto_message_version(test3);
	ok(ret == 0, "Protocol message version is unknown");
}

static void test_otrl_proto_instance(void)
{
	/* Canary that shouldn't get modified on error. */
	unsigned int inst_from = 42, inst_to = 42;
	gcry_error_t ret;

	/*
	 * Instance tags only supported in protocol v3 (AAM in b64).  The msg type
	 * here is "A" which does not represent a valid one but we don't care
	 * followed by the Sender Instance set to 1 and Receiver Instance set to 2.
	 */
	const char *test1 = "?OTR:AAMAAAAAAQAAAAI==";
	ret = otrl_proto_instance(test1, &inst_from, &inst_to);
	ok(ret == gcry_error(GPG_ERR_NO_ERROR)
		&& inst_from == 1
		&& inst_to == 2,
		"Proto instance find for v3");

	/* Reset canary. */
	inst_from = inst_to = 42;

	/* Len is not enough here. */
	const char *test2 = "?OTR:AAMAAA=";
	ret = otrl_proto_instance(test2, &inst_from, &inst_to);
	ok(ret == gcry_error(GPG_ERR_INV_VALUE)
		&& inst_from == 42
		&& inst_to == 42, "Proto instance failed for v3");

	/* Reset canary. */
	inst_from = inst_to = 42;

	/* Message from protocol v2. */
	const char *test3 = "?OTR:AAIAAAAAAQAAAAI==";
	ret = otrl_proto_instance(test3, &inst_from, &inst_to);
	ok(ret == gcry_error(GPG_ERR_INV_VALUE)
			&& inst_from == 42
			&& inst_to == 42, "Proto instance failed for v2");
}

static void test_otrl_version(void)
{
	ok(strcmp(otrl_version(), OTRL_VERSION) == 0, "Otrl version OK");
}

static void test_otrl_proto_create_data(void)
{
	char *encmessagep = NULL, *msg = "HELO";
	unsigned char flags = 12;
	unsigned char *extrakey = NULL;
	OtrlTLV *tlvs = NULL;
	ConnContext *context =
		new_context("Alice", "Alice's account", "Secret protocol");

	context->msgstate = OTRL_MSGSTATE_PLAINTEXT;
	ok(otrl_proto_create_data(&encmessagep, context, msg, tlvs, flags,
			extrakey) == gcry_error(GPG_ERR_CONFLICT),
			"Conflict detected for msgstate plaintext");

	context->msgstate = OTRL_MSGSTATE_ENCRYPTED;
	context->context_priv->their_keyid = 0;
	ok(otrl_proto_create_data(&encmessagep, context, msg, tlvs, flags,
			extrakey) == gcry_error(GPG_ERR_CONFLICT),
			"Conflict detected for msgstate encrypted");
}

int main(int argc, char **argv)
{
	plan_tests(NUM_TESTS);

	gcry_control(GCRYCTL_SET_THREAD_CBS, &gcry_threads_pthread);
	OTRL_INIT;

	test_otrl_proto_default_query_msg();
	test_otrl_proto_query_bestversion();
	test_otrl_init();
	test_otrl_proto_whitespace_bestversion();
	test_otrl_proto_message_type();
	test_otrl_proto_message_version();
	test_otrl_proto_instance();
	test_otrl_version();
	test_otrl_proto_create_data();

	return 0;
}
