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

#include <context.h>

#include <tap/tap.h>

#define NUM_TESTS 22

static void test_otrl_context_find_fingerprint(void)
{
	unsigned char fingerprint[20] = {0};
	int add_if_missing = 0, addedp = 0;

	ok(otrl_context_find_fingerprint(NULL, fingerprint,
			add_if_missing, &addedp) == NULL, "NULL context detected");
}

static ConnContext *new_context(const char *user, const char *account,
		const char *protocol)
{
	ConnContext *context;
	context = calloc(1, sizeof(ConnContext));
	context->username = strdup(user);
	context->accountname = strdup(account);
	context->protocol = strdup(protocol);
	context->m_context = context;
	context->active_fingerprint = calloc(1, sizeof(Fingerprint));
	context->context_priv = calloc(1, sizeof(ConnContextPriv));

	return context;
}

static void free_context(ConnContext *context)
{
	free(context->username);
	free(context->accountname);
	free(context->protocol);
	free(context);
}

static void test_otrl_context_find_recent_instance()
{
	ConnContext *context = new_context("main", "main", "main");
	ConnContext *context_child = new_context("child", "child", "child");
	ConnContext *context_rcvd = new_context("rcvd", "rcvd", "rcvd");
	ConnContext *context_sent = new_context("sent", "sent", "sent");
	ConnContext *tmp;

	context->recent_child = context_child;
	context->recent_rcvd_child = context_rcvd;
	context->recent_sent_child = context_sent;

	ok(otrl_context_find_recent_instance(NULL, OTRL_INSTAG_RECENT) == NULL,
			"NULL context detected");

	tmp = otrl_context_find_recent_instance(context, OTRL_INSTAG_RECENT);
	ok(strcmp(tmp->username, "child") == 0, "OTRL_INSTAG_RECENT ok");

	tmp = otrl_context_find_recent_instance(context,
			OTRL_INSTAG_RECENT_RECEIVED);
	ok(strcmp(tmp->username, "rcvd") == 0, "OTRL_INSTAG_RECENT_RECEIVED ok");

	tmp = otrl_context_find_recent_instance(context, OTRL_INSTAG_RECENT_SENT);
	ok(strcmp(tmp->username, "sent") == 0, "OTRL_INSTAG_RECENT_SENT ok");

	tmp = otrl_context_find_recent_instance(context, INT_MAX);
	ok(!tmp, "Invalid instag detected");

	free_context(context);
	free_context(context_child);
	free_context(context_rcvd);
	free_context(context_sent);
}

static void test_otrl_context_find_recent_secure_instance(void)
{
	ConnContext *context1 = new_context("1", "1", "1");
	ConnContext *context2 = new_context("2", "2", "2");
	ConnContext *tmp;

	ok(otrl_context_find_recent_secure_instance(NULL) == NULL,
			"NULL detected");

	context1->next = context2;
	context2->next = NULL;
	context2->m_context = context1;

	context1->msgstate = OTRL_MSGSTATE_PLAINTEXT;
	context2->msgstate = OTRL_MSGSTATE_PLAINTEXT;
	tmp = otrl_context_find_recent_secure_instance(context1);
	ok(tmp == context2, "Same msgstate");

	context1->msgstate = OTRL_MSGSTATE_PLAINTEXT;
	context2->msgstate = OTRL_MSGSTATE_FINISHED;
	tmp = otrl_context_find_recent_secure_instance(context1);
	ok(tmp == context2, "plaintext then finished");

	context1->msgstate = OTRL_MSGSTATE_PLAINTEXT;
	context2->msgstate = OTRL_MSGSTATE_ENCRYPTED;
	tmp = otrl_context_find_recent_secure_instance(context1);
	ok(tmp == context2, "Most secure context found");

	context1->msgstate = OTRL_MSGSTATE_ENCRYPTED;
	context2->msgstate = OTRL_MSGSTATE_ENCRYPTED;
	tmp = otrl_context_find_recent_secure_instance(context1);
	ok(tmp == context2, "Most secure context found");

	context1->msgstate = OTRL_MSGSTATE_PLAINTEXT;
	context2->msgstate = OTRL_MSGSTATE_PLAINTEXT;
	context2->active_fingerprint->trust = strdup("hello");
	tmp = otrl_context_find_recent_secure_instance(context1);
	ok(tmp == context2, "Most secure context found");
	free(context2->active_fingerprint);
	context2->active_fingerprint = NULL;

	context1->msgstate = OTRL_MSGSTATE_PLAINTEXT;
	context2->msgstate = OTRL_MSGSTATE_PLAINTEXT;
	context2->context_priv->lastrecv = 1;
	tmp = otrl_context_find_recent_secure_instance(context1);
	ok(tmp == context2, "Most secure context found");

	context1->msgstate = OTRL_MSGSTATE_PLAINTEXT;
	context1->context_priv->lastrecv = 2;
	context2->msgstate = OTRL_MSGSTATE_PLAINTEXT;
	tmp = otrl_context_find_recent_secure_instance(context1);
	ok(tmp == context1, "Most secure context found");

	free_context(context1);
	free_context(context2);
}

static void test_otrl_context_is_fingerprint_trusted()
{
	Fingerprint fprint;
	fprint.trust = NULL;

	ok(otrl_context_is_fingerprint_trusted(NULL) == 0,
			"NULL fingerprint detected");
	ok(otrl_context_is_fingerprint_trusted(&fprint) == 0,
			"NULL trust detected");
	fprint.trust = "1234";
	ok(otrl_context_is_fingerprint_trusted(&fprint) != 0,
			"Trusted fingerprint detected");
}

static void test_otrl_context_update_recent_child()
{
	ConnContext context1, context2;
	context1.m_context = &context1;
	context2.m_context = &context1;

	otrl_context_update_recent_child(&context1, 0);
	ok(context1.recent_rcvd_child == &context1 &&
			context1.recent_child == &context1,
			"Recent self rcvd set");

	otrl_context_update_recent_child(&context1, 1);
	ok(context1.recent_sent_child == &context1 &&
			context1.recent_child == &context1,
			"Recent self sent set");

	otrl_context_update_recent_child(&context2, 0);
	ok(context1.recent_rcvd_child == &context2 &&
			context1.recent_child == &context2,
			"Recent rcvd set");

	otrl_context_update_recent_child(&context2, 1);
	ok(context1.recent_sent_child == &context2 &&
			context1.recent_child == &context2,
			"Recent sent set");
}

static void test_otrl_context_set_trust(void)
{
	Fingerprint fprint;
	const char *trust = "I don't trust anyone.";

	fprint.trust = NULL;

	otrl_context_set_trust(&fprint, trust);
	ok(strcmp(fprint.trust, trust) == 0, "Fingerprint set with success");
}

int main(int argc, char **argv)
{
	plan_tests(NUM_TESTS);

	test_otrl_context_set_trust();
	test_otrl_context_find_recent_instance();
	test_otrl_context_find_fingerprint();
	test_otrl_context_find_recent_secure_instance();
	test_otrl_context_is_fingerprint_trusted();
	test_otrl_context_update_recent_child();

	return 0;
}
