#!/usr/bin/env python
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""
Runs the Bloat test harness
"""

import sys
import os, os.path, platform, subprocess, signal
import shutil
import mozprofile
import mozrunner
import jsbridge
import mozmill
import socket
import copy

# Python 2.6 has the json module, but Python 2.5 doesn't.
try:
    import json
except ImportError:
    import simplejson as json

SCRIPT_DIRECTORY = os.path.abspath(os.path.realpath(os.path.dirname(sys.argv[0])))
sys.path.append(SCRIPT_DIRECTORY)

import mozcrash

from time import sleep
import imp

PROFILE_DIR = os.path.join(SCRIPT_DIRECTORY, 'mozmillprofile')
SYMBOLS_PATH = None
PLUGINS_PATH = None
# XXX This breaks any semblance of test runner modularity, and only works
# because we know that we run MozMill only once per process. This needs to be
# fixed if that ever changes.
TEST_NAME = None
TESTING_MODULES_DIR = None

# The name of the (optional) module that tests can define as a wrapper (e.g. to
# run before Thunderbird is started)
WRAPPER_MODULE_NAME = "wrapper"

# The wrapper module (if any) for the test. Just like TEST_NAME, this breaks any
# semblance of modularity.
wrapper = None

# Shall we print out a big blob of base64 to allow post-processors to print out
# a screenshot at the time the failure happened?
USE_RICH_FAILURES = False

# We need this because rmtree-ing read-only files fails on Windows
def rmtree_onerror(func, path, exc_info):
    """
    Error handler for ``shutil.rmtree``.

    If the error is due to an access error (read only file)
    it attempts to add write permission and then retries.

    If the error is for another reason it re-raises the error.

    Usage : ``shutil.rmtree(path, onerror=rmtree_onerror)``
    """
    import stat
    if not os.access(path, os.W_OK):
        # Is the error an access error ?
        os.chmod(path, stat.S_IWUSR)
        func(path)
    else:
        raise

class ThunderTestProfile(mozprofile.ThunderbirdProfile):
    preferences = {
        # say yes to debug output via dump
        'browser.dom.window.dump.enabled': True,
        # say no to slow script warnings
        'dom.max_chrome_script_run_time': 0,
        'dom.max_script_run_time': 0,
        # disable extension stuffs
        'extensions.update.enabled'    : False,
        'extensions.update.notifyUser' : False,
        # don't warn about third party extensions in profile or elsewhere.
        'extensions.autoDisableScopes': 10,
        # do not ask about being the default mail client
        'mail.shell.checkDefaultClient': False,
        # do not tell us about the greatness that is mozilla (about:rights)
        'mail.rights.override': True,
        # disable non-gloda indexing daemons
        'mail.winsearch.enable': False,
        'mail.winsearch.firstRunDone': True,
        'mail.spotlight.enable': False,
        'mail.spotlight.firstRunDone': True,
        # disable address books for undisclosed reasons
        'ldap_2.servers.osx.position': 0,
        'ldap_2.servers.oe.position': 0,
        # disable the first use junk dialog
        'mailnews.ui.junk.firstuse': False,
        # set the relative dirs properly
        'mail.root.none-rel' :  "[ProfD]Mail",
        'mail.root.pop3-rel' :  "[ProfD]Mail",
        # Do not allow check new mail to be set
        'mail.startup.enabledMailCheckOnce' :  True,
        # Disable compatibility checking
        'extensions.checkCompatibility.nightly': False,
        # Stop any pings to AMO on add-on install
        'extensions.getAddons.cache.enabled': False,
        # In case a developer is working on a laptop without a network
        # connection, don't detect offline mode; hence we'll still startup
        # online which is what mozmill currently requires. It'll also protect us
        # from any random network failures.
        'offline.autoDetect': False,
        # Don't load what's new or the remote start page - keep everything local
        # under our control.
        'mailnews.start_page_override.mstone' :  "ignore",
        'mailnews.start_page.url': "about:blank",
        # Do not enable gloda
        'mailnews.database.global.indexer.enabled': False,
        # But do have gloda log if it does anything.  (When disabled, queries
        # are still serviced; they just should not result in any matches.)
        'mailnews.database.global.logging.upstream': True,
        # Do not allow fonts to be upgraded
        'mail.font.windows.version': 2,
        # No, we don't want to be prompted about Telemetry
        'toolkit.telemetry.prompted': 999,
        }

    # Dummied up local accounts to stop the account wizard
    account_preferences = {
        'mail.account.account1.server' :  "server1",
        'mail.account.account2.identities' :  "id1,id2",
        'mail.account.account2.server' :  "server2",
        'mail.account.account3.server' :  "server3",
        'mail.accountmanager.accounts' :  "account1,account2,account3",
        'mail.accountmanager.defaultaccount' :  "account2",
        'mail.accountmanager.localfoldersserver' :  "server1",
        'mail.identity.id1.fullName' :  "Tinderbox",
        'mail.identity.id1.htmlSigFormat' : False,
        'mail.identity.id1.htmlSigText' : "Tinderbox is soo 90ies",
        'mail.identity.id1.smtpServer' :  "smtp1",
        'mail.identity.id1.useremail' :  "tinderbox@foo.invalid",
        'mail.identity.id1.valid' :  True,
        'mail.identity.id2.fullName' : "Tinderboxpushlog",
        'mail.identity.id2.htmlSigFormat' : True,
        'mail.identity.id2.htmlSigText' : "Tinderboxpushlog is the new <b>hotness!</b>",
        'mail.identity.id2.smtpServer' : "smtp1",
        'mail.identity.id2.useremail' : "tinderboxpushlog@foo.invalid",
        'mail.identity.id2.valid' : True,
        'mail.server.server1.directory-rel' :  "[ProfD]Mail/Local Folders",
        'mail.server.server1.hostname' :  "Local Folders",
        'mail.server.server1.name' :  "Local Folders",
        'mail.server.server1.type' :  "none",
        'mail.server.server1.userName' :  "nobody",
        'mail.server.server2.check_new_mail' :  False,
        'mail.server.server2.directory-rel' :  "[ProfD]Mail/tinderbox",
        'mail.server.server2.download_on_biff' :  True,
        'mail.server.server2.hostname' :  "tinderbox123",
        'mail.server.server2.login_at_startup' :  False,
        'mail.server.server2.name' :  "tinderbox@foo.invalid",
        'mail.server.server2.type' :  "pop3",
        'mail.server.server2.userName' :  "tinderbox",
        'mail.server.server2.whiteListAbURI': "",
        'mail.server.server3.hostname' :  "prpl-irc",
        'mail.server.server3.imAccount' :  "account1",
        'mail.server.server3.type' :  "im",
        'mail.server.server3.userName' :  "mozmilltest@irc.mozilla.invalid",
        'mail.smtp.defaultserver' :  "smtp1",
        'mail.smtpserver.smtp1.hostname' :  "tinderbox123",
        'mail.smtpserver.smtp1.username' :  "tinderbox",
        'mail.smtpservers' :  "smtp1",
        'messenger.account.account1.autoLogin' :  False,
        'messenger.account.account1.firstConnectionState' :  1,
        'messenger.account.account1.name' :  "mozmilltest@irc.mozilla.invalid",
        'messenger.account.account1.prpl' :  "prpl-irc",
        'messenger.accounts' :  "account1",
    }

    def __init__(self, *args, **kwargs):
        kwargs['profile'] = self.get_profile_dir()
        super(ThunderTestProfile, self).__init__(*args, **kwargs)
        self.set_preferences(self.preferences)

        if (wrapper is not None and hasattr(wrapper, "NO_ACCOUNTS")
            and wrapper.NO_ACCOUNTS):
            pass
        else:
            self.set_preferences(self.account_preferences)


    def get_profile_dir(self):
        '''
        We always put our profile in the same location.  We only clear it out
        when we are creating a new profile so that we can go in after the run
        and examine things for debugging or general interest.
        '''
        # create a clean directory
        if os.path.exists(PROFILE_DIR):
            shutil.rmtree(PROFILE_DIR, onerror=rmtree_onerror)
        os.makedirs(PROFILE_DIR)
        print 'Using profile dir:', PROFILE_DIR
        if not os.path.exists(PROFILE_DIR):
            raise Exception('somehow failed to create profile dir!')

        if PLUGINS_PATH:
          if not os.path.exists(PLUGINS_PATH):
            raise Exception('Plugins path "%s" does not exist.' % PLUGINS_PATH)

          dest = os.path.join(PROFILE_DIR, "plugins")
          shutil.copytree(PLUGINS_PATH, dest)

        if wrapper is not None and hasattr(wrapper, "on_profile_created"):
            # It's a little dangerous to allow on_profile_created access to the
            # profile object, because it isn't fully initalized yet
            wrapper.on_profile_created(PROFILE_DIR)

        return PROFILE_DIR

    def cleanup(self):
        '''
        Do not cleanup at all.  The next iteration will cleanup for us, but
        until that time it's useful for debugging failures to leave everything
        around.
        '''
        pass

def ThunderTestRunner(*args, **kwargs):
    kwargs['env'] = env = dict(os.environ)
    # note, we do NOT want to set NO_EM_RESTART or jsbridge wouldn't work
    # avoid dialogs on windows
    if 'NO_EM_RESTART' in env:
        del env['NO_EM_RESTART']
    if 'XPCOM_DEBUG_BREAK' not in env:
        env['XPCOM_DEBUG_BREAK'] = 'stack'
    # do not reuse an existing instance
    env['MOZ_NO_REMOTE'] = '1'

    return mozrunner.ThunderbirdRunner(*args, **kwargs)

class ThunderTestMozmill(mozmill.MozMill):
    VNC_SERVER_PATH = '/usr/bin/vncserver'
    VNC_PASSWD_PATH = '~/.vnc/passwd'

    def __init__(self, *args, **kwargs):
        # Only use the VNC server if the capability is available and a password
        # is already defined so this can run without prompting the user.
        self.use_vnc_server = (
            platform.system() == 'Linux' and
            os.path.isfile(self.VNC_SERVER_PATH) and
            os.path.isfile(os.path.expanduser(self.VNC_PASSWD_PATH)) and
            os.environ.get('MOZMILL_NO_VNC') != '1')

        global USE_RICH_FAILURES
        USE_RICH_FAILURES = (os.environ.get('MOZMILL_RICH_FAILURES') == '1')

        super(ThunderTestMozmill, self).__init__(*args, **kwargs)

    def start(self, profile=None, runner=None):
        if not profile:
            profile = self.profile_class(addons=[jsbridge.extension_path, extension_path])
        self.profile = profile
        
        if not runner:
            runner = self.runner_class(profile=self.profile, 
                                       cmdargs=["-jsbridge", str(self.jsbridge_port)])
        self.runner = runner

        if self.use_vnc_server:
            try:
                subprocess.check_call([self.VNC_SERVER_PATH, ':99'])
            except subprocess.CalledProcessError, ex:
                # Okay, so that display probably already exists.  We can either
                # use it as-is or kill it.  I'm deciding we want to kill it
                # since there might be other processes alive in there that
                # want to make trouble for us.
                subprocess.check_call([self.VNC_SERVER_PATH, '-kill', ':99'])
                # Now let's try again.  if this didn't work, let's just let
                # the exception kill us.
                subprocess.check_call([self.VNC_SERVER_PATH, ':99'])
            self.vnc_alive = True
            self.runner.env['DISPLAY'] = ':99'

        if wrapper is not None and hasattr(wrapper, "on_before_start"):
            wrapper.on_before_start(self.runner.profile)

        return super(ThunderTestMozmill, self).start(profile, runner)

    def stop_runner(self, *args, **kwargs):
        '''
        Wrap the call to wait in logic that kills the VNC server when we are
        done waiting.  During normal operation, wait is the last thing.  In
        the keyboard interrupt case wait will die due to the interrupt and
        stop/kill will be killed.  Since we are wrapping wait, we don't need
        to specialize for stop/kill though.
        '''
        try:
            return super(ThunderTestMozmill, self).stop_runner(*args, **kwargs)
        finally:
            try:
                if self.use_vnc_server and self.vnc_alive:
                    subprocess.check_call([self.VNC_SERVER_PATH,
                                           '-kill', ':99'])
            except Exception, ex:
                print '!!! Exception during killing VNC server:', ex


def monkeypatched_15_run_tests(self, tests, sleeptime=0):
    frame = mozmill.jsbridge.JSObject(self.bridge,
                "Components.utils.import('resource://mozmill/modules/frame.js')")
    sleep(sleeptime)

    # transfer persisted data
    frame.persisted = self.persisted

    frame.registerModule("testing-common", TESTING_MODULES_DIR)

    if len(tests) == 1 and not os.path.isdir(tests[0]):
        # tests[0] isn't necessarily an abspath'd path, so do that now
        test = os.path.abspath(tests[0])
        frame.runTestFile(test)
    else:
        # run the test files
        for test_dir in self.test_dirs:
            frame.runTestDirectory(test_dir)

    # Give a second for any callbacks to finish.
    sleep(1)
if hasattr(mozmill.MozMill, 'find_tests'):
    # Monkey-patch run_tests
    mozmill.MozMill.old_run_tests = mozmill.MozMill.run_tests
    mozmill.MozMill.run_tests = monkeypatched_15_run_tests

class ThunderTestCLI(mozmill.CLI):
    mozmill_class = ThunderTestMozmill

    def add_options(self, parser):
        mozmill.CLI.add_options(self, parser)
        parser.add_option('--symbols-path', default=None, dest="symbols",
                          help="The path to the symbol files from build_symbols")
        parser.add_option('--plugins-path', default=None, dest="plugins",
                          help="The path to the plugins directory for the created profile")
        parser.add_option('--testing-modules-dir', default=None,
                          dest="testingmodules",
                          help="The path to the testing modules directory")

    def __init__(self, *args, **kwargs):
        global SYMBOLS_PATH, PLUGINS_PATH, TEST_NAME, TESTING_MODULES_DIR

        # note: we previously hardcoded a JS bridge timeout of 300 seconds,
        # but the default is now 60 seconds...
        mozmill.CLI.__init__(self, *args, **kwargs)

        # Mozrunner expects the filename on OS X to point to the executable, but
        # we only have the directory passed in. Remedy this.
        if (sys.platform == 'darwin' and
                self.options.binary.find('Contents/MacOS/') == -1):
            self.options.binary = os.path.join(self.options.binary,
                'Contents/MacOS/thunderbird-bin')

        # Add these manually after the fact. No way to override the defaults
        # from mozrunner that I can see.
        self.runner_class = ThunderTestRunner
        self.profile_class = ThunderTestProfile

        SYMBOLS_PATH = self.options.symbols
        PLUGINS_PATH = self.options.plugins
        TESTING_MODULES_DIR = self.options.testingmodules
        if isinstance(self.options.test, basestring):
            test_paths = [self.options.test]
        else:
            test_paths = self.options.test
        TEST_NAME = ', '.join([os.path.basename(t) for t in test_paths])

        test_dirs = self.test_dirs = []
        for test_file in test_paths:
            test_file = os.path.abspath(test_file)
            if not os.path.isdir(test_file):
                test_file = os.path.dirname(test_file)
            if not test_file in test_dirs:
                test_dirs.append(test_file)

        # if we are monkeypatching, give it the test directories.
        if hasattr(self.mozmill, 'find_tests'):
            self.mozmill.test_dirs = test_dirs

        self._load_wrapper()

    def _load_wrapper(self):
        global wrapper
        """
        Load the wrapper module if it is present in the test directory.
        """
        if len(self.test_dirs) > 1:
            raise Exception("Wrapper semantics require only a single test dir")
        testdir = self.test_dirs[0]

        try:
            (fd, path, desc) = imp.find_module(WRAPPER_MODULE_NAME, [testdir])
        except ImportError:
            # No wrapper module, which is fine.
            pass
        else:
            try:
                wrapper = imp.load_module(WRAPPER_MODULE_NAME, fd, path, desc)
            finally:
                if fd is not None:
                    fd.close()


TEST_RESULTS = []
# Versions of MozMill prior to 1.5 did not output test-pass /
# TEST-UNEXPECTED-FAIL. Since 1.5 happened this gets output, so we only want
# a summary at the end to make it easy for developers.
def logEndTest(obj):
    # If we've got a string here, we know we're later than 1.5, and we can just
    # display a summary at the end as 1.5 will do TEST-UNEXPECTED-FAIL for us.
    if isinstance(obj, str):
        obj = json.loads(obj)
        obj['summary'] = True
    TEST_RESULTS.append(obj)
mozmill.LoggerListener.cases['mozmill.endTest'] = logEndTest

# We now send extended meta-data about failures.  We do not want the entire
# message dumped with this extra data, so clobber the default mozmill.fail
# with one that wraps it and only tells it the exception message rather than
# the whole JSON blob.
ORIGINAL_FAILURE_LOGGER = mozmill.LoggerListener.cases['mozmill.fail']
def logFailure(obj):
    if isinstance(obj, basestring):
        obj = json.loads(obj)
    if 'exception' in obj:
        objex = obj['exception']
        if 'message' in objex:
            report_as = objex['message']
        else:
            report_as = 'Empty object thrown as an exception somehow'
    else:
        report_as = 'No exception provided'
    ORIGINAL_FAILURE_LOGGER(report_as)
mozmill.LoggerListener.cases['mozmill.fail'] = logFailure


def prettifyFilename(path, tail_segs_desired=1):
    parts = path.split('/')
    return '/'.join(parts[-tail_segs_desired:])

def prettyPrintException(e):
    print '  EXCEPTION:', e.get('message', 'no message!')
    print '    at:', prettifyFilename(e.get('fileName', 'nonesuch')), 'line', e.get('lineNumber', 0)
    if 'stack' in e:
        for line in e['stack'].splitlines():
            if not line:
                continue
            if line[0] == "(":
                funcname = None
            elif line[0] == "@":
                # this is probably the root, don't care
                continue
            else:
                funcname = line[:line.find('@')]
            pathAndLine = line[line.rfind('@')+1:]
            rcolon = pathAndLine.rfind(':')
            if rcolon != -1:
                path = pathAndLine[:rcolon]
                line = pathAndLine[rcolon+1:]
            else:
                path = pathAndLine
                line = 0
            if funcname:
                print '      ', funcname, prettifyFilename(path), line
            else:
                print '           ', prettifyFilename(path), line


# Tests that are useless and shouldn't be printed if successful
TEST_BLACKLIST = ["setupModule", "setupTest", "teardownTest", "teardownModule"]

import pprint, atexit
@atexit.register
def prettyPrintResults():
    for result in TEST_RESULTS:
        #pprint.pprint(result)
        testOrSummary = 'TEST'
        if 'summary' in result:
            testOrSummary = 'SUMMARY'
        if len(result['fails']) == 0:
            if result.get('skipped', False):
                kind = 'SKIP'
            else:
                kind = 'PASS'
            if result['name'] not in TEST_BLACKLIST:
                print '%s-%s | %s' % (testOrSummary, kind, result['name'])
        else:
            print '%s-UNEXPECTED-FAIL | %s | %s' % (testOrSummary, prettifyFilename(result['filename']), result['name'])
        for failure in result['fails']:
            if 'exception' in failure:
                prettyPrintException(failure['exception'])

@atexit.register
def dumpRichResults():
    if USE_RICH_FAILURES:
        print '##### MOZMILL-RICH-FAILURES-BEGIN #####'
        for result in TEST_RESULTS:
            if len(result['fails']) > 0:
                for failure in result['fails']:
                    failure['fileName'] = prettifyFilename(result['filename'], 2)
                    failure['testName'] = result['name']
                    print json.dumps(failure)
        print '##### MOZMILL-RICH-FAILURES-END #####'

def checkCrashesAtExit():
    if mozcrash.check_for_crashes(os.path.join(PROFILE_DIR, 'minidumps'), SYMBOLS_PATH,
                                  TEST_NAME):
        print >> sys.stderr, 'TinderboxPrint: ' + TEST_NAME + '<br/><em class="testfail">CRASH</em>'
        sys.exit(1)

if __name__ == '__main__':
    # Too bad atexit doesn't return a non-zero exit code when it encounters an
    # exception in a handler.
    try:
        ThunderTestCLI().run()
    finally:
        checkCrashesAtExit()
