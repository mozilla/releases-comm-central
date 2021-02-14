#!/usr/bin/python
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""
Rewrite of ChatZilla's makexpi.sh into python

This code isnt especially pythonic, as I have
tried to follow the code and control flow from
the original shell script
"""

import os
import os.path
import sys
import shutil
import re
import zipfile
from os.path import join as joinpath

# Set up settings and paths for finding files.
pwd = os.path.dirname(__file__)

ffversion = '56.*'
smversion = '2.57.*'

if pwd == '':
    pwd = os.getcwd()
else:
    os.chdir(pwd)

def getenv(var, default, dir=False, check=False):
    """
    Grab an environment variable, or a default
    """
    try:
        value = os.environ[var]
    except KeyError:
        value = default
    if dir:
        if not os.path.isabs(value):
            value = os.path.normpath(joinpath(pwd, value))
        else:
            value = os.path.normpath(value)
        if check and not os.path.isdir(value):
            print 'ERROR: Directory %s not found.' % value
            sys.exit(1)

    return value


debug     = int(getenv('DEBUG', 0))
configdir = getenv('CONFIGDIR', joinpath(pwd, 'config'), dir=True, check=True)

# Display all the settings and paths if we're in debug mode.
if debug > 0:
    print 'DEBUG     = %s' % debug
    print 'CONFIGDIR = %s' % configdir

# append the config dir to path before importing the utils
sys.path.append(configdir)

from Preprocessor import preprocess
from JarMaker import JarMaker

## define functions to replace the OS calls from makexpi.sh

def echo(str):
    """
    print a string without a newline or trailing space

    generally used in place of "echo -n" from the original code
    """
    sys.stdout.write(str)

def rm(path):
    """
    remove file or directory, recurses on directory

    This will fail silently if the file is not found
    but any other exceptions will be raised
    """
    try:
        if os.path.isdir(path):
            shutil.rmtree(path)
        else:
            os.remove(path)
    except WindowsError, ex:
        if ex.errno != 2:
            raise
def mkdir(dir):
    """
    acts like mkdir -p
    """
    try:
        os.makedirs(dir)
    except os.error:
        pass # dont error out if there dir already exists

def copy(src, dst):
    """
    copy file
    """
    shutil.copy(src, dst)

def move(src, dst):
    """
    move file
    """
    shutil.move(src, dst)

def sed((pattern, replacement), input, output):
    """
    similar functionality to unix command 'sed'
    """
    regex = re.compile(pattern)
    for line in input:
        line = regex.sub(replacement, line)
        output.write(line)

def zip(filename, source_dir, include=None, exclude=None):
    """
    create a zip file of a directory's contents

    include and exclude are filtering functions, they will
    be passed the basename of each file in the directory
    and should either return true or false if the file
    should be included or excluded respectively
    """
    z = zipfile.ZipFile(filename, 'w', zipfile.ZIP_DEFLATED)
    for dirpath, dirnames, filenames in os.walk(source_dir):
        for filename in filenames:
            if include is not None and not include(filename) \
            or exclude is not None and exclude(filename):
                continue
            full_filename = joinpath(dirpath, filename)
            offset = len(os.path.commonprefix([source_dir,full_filename])) + 1
            archive_filename = full_filename[offset:]
            z.write(full_filename, archive_filename)
    z.close()

## Begin real program ##

def clean():
    """
    check arguments for cleanup flag
    """
    for arg in sys.argv:
        if arg == 'clean':
            return True
    return False

def locale():
    """
    check arguments for locale or return None
    """
    locale_pattern = re.compile(r'^[a-z]{1,3}(?:-[A-Z]{1,3}(?:-[a-z]{1,3})?)?$')
    for arg in sys.argv:
        locale_match = locale_pattern.match(arg)
        if locale_match is not None:
            return arg
    return None

def version(fedir):
    """
    get version number from source files
    """
    version_pattern = re.compile(r'const __cz_version\s+=\s*\"([^\"]+)\"')
    for line in open(joinpath(fedir, 'xul', 'content', 'static.js'), 'r'):
        match = version_pattern.match(line)
        if match is None:
            continue
        return match.group(1)
    print 'ERROR: Unable to get version number.'
    sys.exit(1)

fedir     = getenv('FEDIR',     joinpath(pwd, '..'), dir=True, check=True)
xpifiles  = getenv('XPIFILES',  joinpath(pwd, 'resources'), dir=True, check=True)
xpiroot   = getenv('XPIROOT',   joinpath(pwd, 'xpi-tree'), dir=True)
jarroot   = getenv('JARROOT',   joinpath(pwd, 'jar-tree'), dir=True)
localedir = getenv('LOCALEDIR', joinpath(fedir, 'locales'), dir=True, check=True)
locale    = locale()
if locale is None:
    locale = getenv('LOCALE', None)
else:
    xpiroot = '%s-%s' % (xpiroot, locale)
    jarroot = '%s-%s' % (jarroot, locale)

version = version(fedir)
xpiname = None

if debug > 0:
    print 'FEDIR     = %s' % fedir
    print 'XPIFILES  = %s' % xpifiles
    print 'XPIROOT   = %s' % xpiroot
    print 'JARROOT   = %s' % jarroot
    print 'LOCALEDIR = %s' % localedir
    print 'LOCALE    = %s' % locale


def check_xpiname(name):
    if debug > 1:
        print '    XPI name: %s' % name
    if os.path.exists(joinpath(pwd, name)):
        print '  WARNING: Output XPI will be overwritten.'
    return name

def progress_chmod(file, mode):
    if debug > 1:
        print '    chmod 0%o %s' % (mode, file)
    else:
        echo('.')
    os.chmod(file, mode)

def progress_copy(infile, outfile):
    if debug > 1:
        print '    copy %s %s' % (infile, outfile)
    else:
        echo('.')
    copy(infile, outfile)

def progress_echo(message):
    if debug > 1:
        print message
    else:
        echo(message)

def progress_jarmaker():
    if debug > 1:
        print '    JarMaker()'
    else:
        echo('.')
    jm = JarMaker()
    jm.outputFormat = 'jar'
    jm.useChromeManifest = True
    jm.useJarfileManifest = False
    return jm

def progress_jarmaker_make(jm, infile, indir, localedirs=None):
    if debug > 1:
        print '    makeJar %s %s %s' % (infile, indir, localedirs)
    else:
        echo('.')
    jm.makeJar(
        infile = open(infile, 'r'),
        jardir = jarroot,
        sourcedirs = [indir],
        localedirs = localedirs,
    )

def progress_mkdir(dir):
    if debug > 1:
        print '    mkdir %s' % dir
    else:
        echo('.')
    if not os.path.isdir(dir):
        mkdir(dir)

def progress_move(infile, outfile):
    if debug > 1:
        print '    move %s %s' % (infile, outfile)
    else:
        echo('.')
    move(infile, outfile)

def progress_preprocess(infile, outfile, defines):
    if debug > 1:
        print '    preprocess %s %s %s' % (defines, infile, outfile)
    else:
        echo('.')
    if not isinstance(infile, (list)):
        infile = [infile]
    preprocess_outfile = open(outfile, 'w')
    preprocess(
        includes = infile,
        defines  = defines,
        output   = preprocess_outfile,
        line_endings = 'lf',
    )
    preprocess_outfile.close()

def progress_rm(file):
    if debug > 1:
        print '    rm %s' % file
    else:
        echo('.')
    rm(file)

def progress_sed(infile, outfile, patterns):
    if debug > 1:
        print '    sed %s %s %s' % (patterns, infile, outfile)
    else:
        echo('.')
    sed_infile = open(infile, 'r')
    sed_outfile = open(outfile, 'w')
    sed(
        patterns,
        input = sed_infile,
        output = sed_outfile,
    )
    sed_infile.close()
    sed_outfile.close()

def progress_zip(indir, outfile):
    if debug > 1:
        print '    zip %s %s' % (indir, outfile)
    else:
        echo('.')
    zip(
        filename = os.path.normpath(outfile),
        source_dir = indir,
        include = lambda fn: True,
        exclude = lambda fn: fn.startswith('log')
    )


def do_clean():
    echo('Cleaning up files')
    echo('.')
    rm(xpiroot)
    echo('.')
    rm(jarroot)
    print('. done.')

def do_build_base():
    print 'Beginning build of ChatZilla %s...' % version
    xpiname = check_xpiname('chatzilla-%s.xpi' % version)

    progress_echo('  Checking XPI structure')
    progress_mkdir(xpiroot)
    progress_mkdir(joinpath(xpiroot, 'chrome'))
    progress_mkdir(joinpath(xpiroot, 'chrome', 'icons'))
    progress_mkdir(joinpath(xpiroot, 'chrome', 'icons', 'default'))
    progress_mkdir(joinpath(xpiroot, 'components'))
    print '            done'

    progress_echo('  Checking JAR structure')
    progress_mkdir(jarroot)
    print '                done'

    progress_echo('  Updating extension files')
    progress_preprocess(joinpath(xpifiles, 'install.rdf'), joinpath(xpiroot, 'install.rdf'), {'CHATZILLA_VERSION': version, 'SEAMONKEY_MAXVERSION': smversion})
    progress_copy(joinpath(xpifiles, 'chatzilla-window.ico'), joinpath(xpiroot, 'chrome', 'icons', 'default', 'chatzilla-window.ico'))
    progress_copy(joinpath(xpifiles, 'chatzilla-window.xpm'), joinpath(xpiroot, 'chrome', 'icons', 'default', 'chatzilla-window.xpm'))
    progress_copy(joinpath(xpifiles, 'chatzilla-window16.xpm'), joinpath(xpiroot, 'chrome', 'icons', 'default', 'chatzilla-window16.xpm'))
    print '   done'

    progress_echo('  Constructing JAR package')
    jm = progress_jarmaker()
    progress_jarmaker_make(jm, joinpath(fedir, 'jar.mn'), fedir)
    progress_jarmaker_make(jm, joinpath(fedir, 'sm', 'jar.mn'), joinpath(fedir, 'sm'))
    progress_jarmaker_make(jm, joinpath(fedir, 'ff', 'jar.mn'), joinpath(fedir, 'ff'))
    progress_preprocess(joinpath(localedir, 'jar.mn'), joinpath(localedir, 'jar.mn.pp'), {'AB_CD': 'en-US'})
    # Define a preprocessor var for the next call to makeJar
    jm.pp.context['AB_CD'] = 'en-US'
    progress_jarmaker_make(jm, joinpath(localedir, 'jar.mn.pp'), localedir, [joinpath(localedir, 'en-US')])
    progress_rm(joinpath(localedir, 'jar.mn.pp'))
    print '        done'

    progress_echo('  Constructing XPI package')
    progress_copy(joinpath(jarroot, 'chatzilla.jar'), joinpath(xpiroot, 'chrome'))
    progress_copy(joinpath(fedir, 'js', 'lib', 'chatzilla-service.js'), joinpath(xpiroot, 'components'))
    progress_move(joinpath(jarroot, '..', 'chrome.manifest'), joinpath(xpiroot, 'chrome.manifest'))
    progress_chmod(joinpath(xpiroot, 'chrome', 'chatzilla.jar'), 0664)
    progress_chmod(joinpath(xpiroot, 'components', 'chatzilla-service.js'), 0664)
    progress_zip(xpiroot, joinpath(pwd, xpiname))
    print '         done'

    print 'Build of ChatZilla %s... ALL DONE' % version


def do_build_locale():
    print 'Beginning build of %s locale for ChatZilla %s...' % (locale, version)
    xpiname = check_xpiname('chatzilla-%s.%s.xpi' % (version, locale))

    progress_echo('  Checking XPI structure')
    progress_mkdir(xpiroot)
    progress_mkdir(joinpath(xpiroot, 'chrome'))
    print '               done'

    progress_echo('  Checking JAR structure')
    progress_mkdir(jarroot)
    print '                done'

    progress_echo('  Updating extension files')
    progress_preprocess([joinpath(localedir, locale, 'defines.inc'), joinpath(localedir, 'generic', 'install.rdf')], joinpath(xpiroot, 'install.rdf.pp'),
             {'IRC_STANDALONE_BUILD': '1', 'CHATZILLA_VERSION': version, 'CHATZILLA_BASE_VERSION': version, 'AB_CD': locale, 'INSTALL_EXTENSION_ID': 'langpack-%s@chatzilla.mozilla.org' % locale, 'MOZ_LANG_TITLE': locale, 'SEAMONKEY_MAXVERSION': smversion})
    progress_sed(joinpath(xpiroot, 'install.rdf.pp'), joinpath(xpiroot, 'install.rdf'), ('chatzilla.jar', 'chatzilla-%s.jar' % locale))
    progress_rm(joinpath(xpiroot, 'install.rdf.pp'))
    print '    done'

    progress_echo('  Constructing JAR package')
    jm = progress_jarmaker()
    progress_preprocess(joinpath(localedir, 'jar.mn'), joinpath(localedir, 'jar.mn.pp'), {'AB_CD': locale})
    jm.pp.context['AB_CD'] = locale
    progress_jarmaker_make(jm, joinpath(localedir, 'jar.mn.pp'), localedir, [joinpath(localedir, locale)])
    progress_rm(joinpath(localedir, 'jar.mn.pp'))
    progress_move(joinpath(jarroot, 'chatzilla.jar'), joinpath(jarroot, 'chatzilla-%s.jar' % locale))
    print '          done'

    progress_echo('  Constructing XPI package')
    progress_copy(joinpath(jarroot, 'chatzilla-%s.jar' % locale), joinpath(xpiroot, 'chrome'))
    progress_sed(joinpath(jarroot, '..', 'chrome.manifest'), joinpath(xpiroot, 'chrome.manifest'), ('chatzilla.jar', 'chatzilla-%s.jar' % locale))
    progress_rm(joinpath(jarroot, '..', 'chrome.manifest'))
    progress_chmod(joinpath(xpiroot, 'chrome', 'chatzilla-%s.jar' % locale), 0664)
    progress_zip(xpiroot, joinpath(pwd, xpiname))
    print '          done'

    print 'Build of %s locale for ChatZilla %s... ALL DONE' % (locale, version)


if clean():
    do_clean()
elif locale is None:
    do_build_base()
else:
    do_build_locale()
