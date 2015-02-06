# ***** BEGIN LICENSE BLOCK *****
# Version: MPL 1.1/GPL 2.0/LGPL 2.1
# 
# The contents of this file are subject to the Mozilla Public License Version
# 1.1 (the "License"); you may not use this file except in compliance with
# the License. You may obtain a copy of the License at
# http://www.mozilla.org/MPL/
# 
# Software distributed under the License is distributed on an "AS IS" basis,
# WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
# for the specific language governing rights and limitations under the
# License.
# 
# The Original Code is Mozilla Corporation Code.
# 
# The Initial Developer of the Original Code is
# Mikeal Rogers.
# Portions created by the Initial Developer are Copyright (C) 2008 -2009
# the Initial Developer. All Rights Reserved.
# 
# Contributor(s):
#  Mikeal Rogers <mikeal.rogers@gmail.com>
#  Henrik Skupin <hskupin@mozilla.com>
# 
# Alternatively, the contents of this file may be used under the terms of
# either the GNU General Public License Version 2 or later (the "GPL"), or
# the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
# in which case the provisions of the GPL or the LGPL are applicable instead
# of those above. If you wish to allow use of your version of this file only
# under the terms of either the GPL or the LGPL, and not to allow others to
# use your version of this file under the terms of the MPL, indicate your
# decision by deleting the provisions above and replace them with the notice
# and other provisions required by the GPL or the LGPL. If you do not delete
# the provisions above, a recipient may use your version of this file under
# the terms of any one of the MPL, the GPL or the LGPL.
# 
# ***** END LICENSE BLOCK *****

import socket
import os
import copy
import asyncore

from time import sleep
from network import Bridge, BackChannel, create_network
from jsobjects import JSObject

import mozrunner

settings_env = 'JSBRIDGE_SETTINGS_FILE'

parent = os.path.abspath(os.path.dirname(__file__))
extension_path = os.path.join(parent, 'extension')

window_string = "Components.classes['@mozilla.org/appshell/window-mediator;1'].getService(Components.interfaces.nsIWindowMediator).getMostRecentWindow('')"

wait_to_create_timeout = 60

def wait_and_create_network(host, port, timeout=wait_to_create_timeout):
    ttl = 0
    while ttl < timeout:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.connect((host, port))
            s.close()
            break
        except socket.error:
            pass
        sleep(.25)
        ttl += .25
    if ttl == timeout:
        raise Exception("Sorry, cannot connect to jsbridge extension, port %s" % port)
    
    back_channel, bridge = create_network(host, port)
    sleep(.5)
    
    while back_channel.registered is False:
        back_channel.close()
        bridge.close()
        asyncore.socket_map = {}
        sleep(1)
        back_channel, bridge = create_network(host, port)
    
    return back_channel, bridge

class CLI(mozrunner.CLI):
    """Command line interface."""
    
    module = "jsbridge"

    def add_options(self, parser):
        """add options to parser"""

        mozrunner.CLI.add_options(self, parser)
        parser.add_option('-D', '--debug', dest="debug", 
                          action="store_true",
                          help="Debug mode", 
                          metavar="JSBRIDGE_DEBUG",
                          default=False)
        parser.add_option('-s', '--shell', dest="shell", 
                          action="store_true",
                          help="Start a Python shell",
                          metavar="JSBRIDGE_SHELL",
                          default=False)
        parser.add_option('-u', '--usecode', dest="usecode",
                          action="store_true",
                          help="Use code module instead of iPython",
                          default=False)
        parser.add_option('-P', '--port', dest="port", default="24242",
                          help="TCP port to run jsbridge on.")

    def profile_args(self):
        profargs = super(CLI, self).profile_args()
        # Bug 1103551: re-enable these preferences.
        #if self.options.debug:
        #    profargs.setdefault('prefences', []).update({
        #      'extensions.checkCompatibility':False,
        #      'devtools.errorconsole.enabled':True,
        #      'javascript.options.strict': True
        #    })
        profargs.setdefault('addons', []).append(extension_path)
        return profargs

    def command_args(self):
        args = super(CLI, self).command_args()
        if self.options.debug:
            args.append('-jsconsole')
        if not 'jsbridge' in args:
            args += ['-jsbridge', self.options.port]
        return args
        
    def run(self):
        runner = self.create_runner()
        runner.start()
        self.start_jsbridge_network()
        if self.options.shell:
            self.start_shell(runner)
        else:
            try:
                runner.wait()
            except KeyboardInterrupt:
                runner.stop()
                
        runner.profile.cleanup()
    
    def start_shell(self, runner):
        try:
            import IPython
        except:
            IPython = None
        if not hasattr(self, 'bridge'):
            self.start_jsbridge_network()
        jsobj = JSObject(self.bridge, window_string)
        
        if IPython is None or self.options.usecode:
            import code
            code.interact(local={"jsobj":jsobj, 
                                 "getBrowserWindow":lambda : getBrowserWindow(self.bridge),
                                 "back_channel":self.back_channel,
                                 })
        else:
            from IPython.Shell import IPShellEmbed
            ipshell = IPShellEmbed([])
            ipshell(local_ns={"jsobj":jsobj, 
                              "getBrowserWindow":lambda : getBrowserWindow(self.bridge),
                              "back_channel":self.back_channel,
                              })
        runner.stop()
        
    def start_jsbridge_network(self, timeout=10):
        port = int(self.options.port)
        host = '127.0.0.1'
        self.back_channel, self.bridge = wait_and_create_network(host, port, timeout)

def cli():
    CLI().run()

def getBrowserWindow(bridge):
    return JSObject(bridge, "Components.classes['@mozilla.org/appshell/window-mediator;1'].getService(Components.interfaces.nsIWindowMediator).getMostRecentWindow('')")
    






