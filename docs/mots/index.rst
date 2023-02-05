..
    This file was automatically generated using `mots export`.

..
    See https://mots.readthedocs.io/en/latest/#quick-start for quick start
    documentation and how to modify this file.


==========
Governance
==========

--------
Overview
--------
To add, remove, or update module information, see the `mots documentation <https://mots.readthedocs.io/en/latest/#adding-a-module>`_.

Thunderbird operates under Mozilla's `module ownership governance system
<https://www.mozilla.org/hacking/module-ownership.html>`_. A module is a
discrete unit of code or activity. An owner is the person in charge of a
module or sub-module. A peer is a person whom the owner has appointed to
help them. A module may have multiple peers and, very occasionally, multiple
owners.

The system is overseen by the owner and peers of the Module Ownership module.
For the modules that make up Thunderbird, oversight is provided by the
Thunderbird Council module. Owners may add and remove peers from their modules
as they wish, without reference to anyone else.


-------
Modules
-------

Thunderbird Council - 2023
~~~~~~~~~~~~~~~~~~~~~~~~~~
The Thunderbird Council is the elected governing body for the Thunderbird
Project, including the code modules that develop the code in Thunderbird
product(s). It is the top-level module of the project, and Peers are members of
the Council.


.. list-table::
    :stub-columns: 1
    :widths: 30 70

    * - Owner(s)
      -
        | `Berna Alp (ba) <https://people.mozilla.org/s?query=ba>`__
    * - Peer(s)
      -
        | `micah (micah) <https://people.mozilla.org/s?query=micah>`__
        | `Danny Colin (sdk) <https://people.mozilla.org/s?query=sdk>`__
        | `John Bieling (TbSync) <https://people.mozilla.org/s?query=TbSync>`__
        | `Ben Bucksch (BenB) <https://people.mozilla.org/s?query=BenB>`__
        | `Patrick Cloke (clokep) <https://people.mozilla.org/s?query=clokep>`__
        | `Philipp Kewisch (Fallen) <https://people.mozilla.org/s?query=Fallen>`__
    * - Excludes
      -
        | suite/\*\*

Thunderbird Desktop
~~~~~~~~~~~~~~~~~~~
Standalone Mail Application.


.. list-table::
    :stub-columns: 1
    :widths: 30 70

    * - Owner(s)
      -
        | `Magnus Melin (mkmelin) <https://people.mozilla.org/s?query=mkmelin>`__
    * - Peer(s)
      -
        | `Geoff Lankow (darktrojan) <https://people.mozilla.org/s?query=darktrojan>`__
        | `Aceman (aceman) <https://people.mozilla.org/s?query=aceman>`__
        | `Richard Marti (Paenglab) <https://people.mozilla.org/s?query=Paenglab>`__
    * - Owner(s) Emeritus
      - Mark Banner, David Bienvenu, Scott MacGregor
    * - Peer(s) Emeritus
      - Blake Winton, Mike Conley, Kent James, Jorg K
    * - Includes
      -
        | mail/\*\*
        | python/\*\*
        | other-licenses/\*\*/thunderbird/\*\*
        | third_party/\*\*
        | tools/\*\*
    * - URL
      - https://developer.thunderbird.net/
    * - Bugzilla Components
      - Thunderbird

Addon Support
=============
APIs to enable extensions, as well as their installation


.. list-table::
    :stub-columns: 1
    :widths: 30 70

    * - Owner(s)
      -
        | `John Bieling (TbSync) <https://people.mozilla.org/s?query=TbSync>`__
    * - Peer(s)
      -
        | `Geoff Lankow (darktrojan) <https://people.mozilla.org/s?query=darktrojan>`__
        | `Philipp Kewisch (Fallen) <https://people.mozilla.org/s?query=Fallen>`__
    * - Includes
      -
        | mail/components/extensions/\*\*
    * - Bugzilla Components
      - Thunderbird::Add-Ons Extensions API, Thunderbird::Add-Ons General


Build Config
============
Build, CI, Release Engineering


.. list-table::
    :stub-columns: 1
    :widths: 30 70

    * - Owner(s)
      -
        | `Rob Lemley (rjl) <https://people.mozilla.org/s?query=rjl>`__
    * - Peer(s)
      -
        | `Philipp Kewisch (Fallen) <https://people.mozilla.org/s?query=Fallen>`__
    * - Peer(s) Emeritus
      - Mark Banner, Siddharth Agarwal, Justin Wood, Joshua Cranmer, Tom Prince
    * - Includes
      -
        | build/\*\*
        | mail/config/\*\*
        | taskcluster/\*\*
    * - Bugzilla Components
      - Thunderbird::Build Config


Instant Messaging
=================
The chat and instant messaging component of Thunderbird


.. list-table::
    :stub-columns: 1
    :widths: 30 70

    * - Owner(s)
      -
        | `Patrick Cloke (clokep) <https://people.mozilla.org/s?query=clokep>`__
    * - Peer(s)
      -
        | `Martin Giger (freaktechnik) <https://people.mozilla.org/s?query=freaktechnik>`__
    * - Owner(s) Emeritus
      - Florian Quèze
    * - Peer(s) Emeritus
      - aleth, Benedikt Pfeifer
    * - Includes
      -
        | mail/components/im/\*\*
        | chat/\*\*
    * - Bugzilla Components
      - Thunderbird::Instant Messaging


Message Security
================
OpenPGP and S/MIME message security


.. list-table::
    :stub-columns: 1
    :widths: 30 70

    * - Owner(s)
      -
        | `Kai Engert (KaiE) <https://people.mozilla.org/s?query=KaiE>`__
    * - Peer(s)
      -
        | `Patrick Brunschwig (patrick) <https://people.mozilla.org/s?query=patrick>`__
        | `Magnus Melin (mkmelin) <https://people.mozilla.org/s?query=mkmelin>`__
    * - Includes
      -
        | mail/extensions/openpgp/\*\*
        | mail/extensions/smime/\*\*


Theme
=====
The interface of Thunderbird related to the OS and custom themes


.. list-table::
    :stub-columns: 1
    :widths: 30 70

    * - Owner(s)
      -
        | `Richard Marti (Paenglab) <https://people.mozilla.org/s?query=Paenglab>`__
    * - Peer(s)
      -
        | `Alessandro Castellani (aleca) <https://people.mozilla.org/s?query=aleca>`__
    * - Peer(s) Emeritus
      - Josiah Bruner (:JosiahOne), Blake Winton, Mike Conley
    * - Includes
      -
        | mail/themes/\*\*
    * - Bugzilla Components
      - Thunderbird::Theme


UX (User Experience)
====================
Usability and user journey, including User Interface and Accessibility


.. list-table::
    :stub-columns: 1
    :widths: 30 70

    * - Owner(s)
      -
        | `Alessandro Castellani (aleca) <https://people.mozilla.org/s?query=aleca>`__
    * - Peer(s)
      -
        | `Richard Marti (Paenglab) <https://people.mozilla.org/s?query=Paenglab>`__
        | `Henry Wilkes (henry-x) <https://people.mozilla.org/s?query=henry-x>`__
        | `Magnus Melin (mkmelin) <https://people.mozilla.org/s?query=mkmelin>`__
    * - Peer(s) Emeritus
      - Blake Winton
    * - Includes
      -
        | mail/branding/\*\*
    * - Bugzilla Components
      - Thunderbird::General


Calendar
~~~~~~~~
Calendaring components


.. list-table::
    :stub-columns: 1
    :widths: 30 70

    * - Owner(s)
      -
        | `Philipp Kewisch (Fallen) <https://people.mozilla.org/s?query=Fallen>`__
    * - Peer(s)
      -
        | `Geoff Lankow (darktrojan) <https://people.mozilla.org/s?query=darktrojan>`__
    * - Includes
      -
        | calendar/\*\*
    * - Bugzilla Components
      - Calendar

User Interface (UI)
===================


.. list-table::
    :stub-columns: 1
    :widths: 30 70

    * - Owner(s)
      -
        | `Richard Marti (Paenglab) <https://people.mozilla.org/s?query=Paenglab>`__
    * - Peer(s)
      -
        | `Alessandro Castellani (aleca) <https://people.mozilla.org/s?query=aleca>`__
    * - Includes
      -
        | calendar/base/content/\*\*
        | calendar/base/themes/\*\*
    * - Bugzilla Components
      - Calendar::Calendar Frontend


Mail and News Core
~~~~~~~~~~~~~~~~~~


.. list-table::
    :stub-columns: 1
    :widths: 30 70

    * - Owner(s)
      -
        | `Joshua Cranmer (jcranmer) <https://people.mozilla.org/s?query=jcranmer>`__
    * - Peer(s)
      -
        | `Ben Campbell (benc) <https://people.mozilla.org/s?query=benc>`__
        | `Neil Rashbrook (neil) <https://people.mozilla.org/s?query=neil>`__
        | `Aceman (aceman) <https://people.mozilla.org/s?query=aceman>`__
        | `Magnus Melin (mkmelin) <https://people.mozilla.org/s?query=mkmelin>`__
    * - Peer(s) Emeritus
      - Karsten Düsterloh (mnyromyr), Kai Engert, David Bienvenu (bienvenu), Mark Banner, Kent James
    * - Includes
      -
        | mailnews/\*\*
    * - Bugzilla Components
      - MailNews Core::Backend, Thunderbird::Account Manager, Thunderbird::Migration,
        MailNews Core::Account Manager, MailNews Core::Composition, MailNews
        Core::Filters, MailNews Core::Internationalization, MailNews Core::Movemail,
        MailNews Core::Networking, MailNews Core::Networking - POP, MailNews
        Core::Printing, MailNews Core::Profile Migration, MailNews Core::Search,
        MailNews Core::Security, MailNews Core::Simple MAPI

Addressbook
===========


.. list-table::
    :stub-columns: 1
    :widths: 30 70

    * - Owner(s)
      -
        | `Geoff Lankow (darktrojan) <https://people.mozilla.org/s?query=darktrojan>`__
    * - Peer(s)
      -
        | `Aceman (aceman) <https://people.mozilla.org/s?query=aceman>`__
        | `Magnus Melin (mkmelin) <https://people.mozilla.org/s?query=mkmelin>`__
    * - Peer(s) Emeritus
      - David Bienvenu (bienvenu), Mark Banner, Mike Conley
    * - Includes
      -
        | mailnews/addrbook/\*\*
    * - Bugzilla Components
      - MailNews Core::Address Book


Feeds
=====


.. list-table::
    :stub-columns: 1
    :widths: 30 70

    * - Owner(s)
      -
        | `Nobody (nobody) <https://people.mozilla.org/s?query=nobody>`__
    * - Peer(s)
      -
        | `alta88 (alta88) <https://people.mozilla.org/s?query=alta88>`__
        | `Magnus Melin (mkmelin) <https://people.mozilla.org/s?query=mkmelin>`__
    * - Includes
      -
        | mailnews/extensions/newsblog/\*\*
    * - Bugzilla Components
      - MailNews Core::Feed Reader


GloDa
=====
Global message database


.. list-table::
    :stub-columns: 1
    :widths: 30 70

    * - Owner(s)
      -
        | `Nobody (nobody) <https://people.mozilla.org/s?query=nobody>`__
    * - Peer(s)
      -
        | `Ben Campbell (benc) <https://people.mozilla.org/s?query=benc>`__
        | `Neil Rashbrook (neil) <https://people.mozilla.org/s?query=neil>`__
        | `Aceman (aceman) <https://people.mozilla.org/s?query=aceman>`__
        | `Magnus Melin (mkmelin) <https://people.mozilla.org/s?query=mkmelin>`__
    * - Peer(s) Emeritus
      - Jonathan Protzenko
    * - Includes
      -
        | mailnews/db/gloda/\*\*


IMAP handling code
==================


.. list-table::
    :stub-columns: 1
    :widths: 30 70

    * - Owner(s)
      -
        | `gene smith (gds) <https://people.mozilla.org/s?query=gds>`__
    * - Peer(s)
      -
        | `Ben Campbell (benc) <https://people.mozilla.org/s?query=benc>`__
        | `Neil Rashbrook (neil) <https://people.mozilla.org/s?query=neil>`__
        | `Aceman (aceman) <https://people.mozilla.org/s?query=aceman>`__
        | `Magnus Melin (mkmelin) <https://people.mozilla.org/s?query=mkmelin>`__
    * - Peer(s) Emeritus
      - Kent James
    * - Includes
      -
        | mailnews/imap/\*\*
    * - Bugzilla Components
      - MailNews Core::Networking: IMAP


Import
======


.. list-table::
    :stub-columns: 1
    :widths: 30 70

    * - Owner(s)
      -
        | `Joshua Cranmer (jcranmer) <https://people.mozilla.org/s?query=jcranmer>`__
    * - Peer(s)
      -
        | `Magnus Melin (mkmelin) <https://people.mozilla.org/s?query=mkmelin>`__
    * - Peer(s) Emeritus
      - David Bienvenu (bienvenu), Mark Banner, Jorg K
    * - Includes
      -
        | mailnews/import/\*\*
    * - Bugzilla Components
      - MailNews Core::Import


Localization
============


.. list-table::
    :stub-columns: 1
    :widths: 30 70

    * - Owner(s)
      -
        | `Nobody (nobody) <https://people.mozilla.org/s?query=nobody>`__
    * - Peer(s)
      -
        | `Philipp Kewisch (Fallen) <https://people.mozilla.org/s?query=Fallen>`__
    * - Peer(s) Emeritus
      - Mark Banner
    * - Includes
      -
        | calendar/locales/\*\*
        | chat/locales/\*\*
        | mail/locales/\*\*
    * - Bugzilla Components
      - MailNews Core::Localization


MIME Parser
===========
RFC822 MIME Parser


.. list-table::
    :stub-columns: 1
    :widths: 30 70

    * - Owner(s)
      -
        | `Nobody (nobody) <https://people.mozilla.org/s?query=nobody>`__
    * - Peer(s)
      -
        | `Jim Porter (squib) <https://people.mozilla.org/s?query=squib>`__
        | `Joshua Cranmer (jcranmer) <https://people.mozilla.org/s?query=jcranmer>`__
        | `Magnus Melin (mkmelin) <https://people.mozilla.org/s?query=mkmelin>`__
    * - Owner(s) Emeritus
      - David Bienvenu (bienvenu)
    * - Peer(s) Emeritus
      - Kai Engert, Jorg K
    * - Includes
      -
        | mailnews/mime/\*\*
    * - Bugzilla Components
      - MailNews Core::MIME, MailNews Core::Attachments


Message Database
================
MSF files


.. list-table::
    :stub-columns: 1
    :widths: 30 70

    * - Owner(s)
      -
        | `Nobody (nobody) <https://people.mozilla.org/s?query=nobody>`__
    * - Peer(s)
      -
        | `Aceman (aceman) <https://people.mozilla.org/s?query=aceman>`__
        | `Joshua Cranmer (jcranmer) <https://people.mozilla.org/s?query=jcranmer>`__
    * - Owner(s) Emeritus
      - David Bienvenu (bienvenu)
    * - Peer(s) Emeritus
      - Kent James
    * - Includes
      -
        | mailnews/db/\*\*
    * - Bugzilla Components
      - MailNews Core::Database


News
====


.. list-table::
    :stub-columns: 1
    :widths: 30 70

    * - Owner(s)
      -
        | `Joshua Cranmer (jcranmer) <https://people.mozilla.org/s?query=jcranmer>`__
    * - Peer(s)
      -
        | `Ben Campbell (benc) <https://people.mozilla.org/s?query=benc>`__
        | `Neil Rashbrook (neil) <https://people.mozilla.org/s?query=neil>`__
        | `Aceman (aceman) <https://people.mozilla.org/s?query=aceman>`__
        | `Magnus Melin (mkmelin) <https://people.mozilla.org/s?query=mkmelin>`__
    * - Peer(s) Emeritus
      - David Bienvenu (bienvenu)
    * - Includes
      -
        | mailnews/news/\*\*
    * - Bugzilla Components
      - MailNews Core::Networking: NNTP


S/MIME
======
S/MIME backend


.. list-table::
    :stub-columns: 1
    :widths: 30 70

    * - Owner(s)
      -
        | `Kai Engert (KaiE) <https://people.mozilla.org/s?query=KaiE>`__
    * - Peer(s)
      -
        | `Ben Campbell (benc) <https://people.mozilla.org/s?query=benc>`__
        | `Neil Rashbrook (neil) <https://people.mozilla.org/s?query=neil>`__
        | `Aceman (aceman) <https://people.mozilla.org/s?query=aceman>`__
        | `Magnus Melin (mkmelin) <https://people.mozilla.org/s?query=mkmelin>`__
    * - Includes
      -
        | mailnews/extensions/smime/\*\*
    * - Bugzilla Components
      - MailNews Core::Security: S/MIME


SMTP
====
Code responsible for sending messages over SMTP.


.. list-table::
    :stub-columns: 1
    :widths: 30 70

    * - Owner(s)
      -
        | `Ping Chen (rnons) <https://people.mozilla.org/s?query=rnons>`__
    * - Peer(s)
      -
        | `Ben Campbell (benc) <https://people.mozilla.org/s?query=benc>`__
        | `Neil Rashbrook (neil) <https://people.mozilla.org/s?query=neil>`__
        | `Aceman (aceman) <https://people.mozilla.org/s?query=aceman>`__
        | `Magnus Melin (mkmelin) <https://people.mozilla.org/s?query=mkmelin>`__
    * - Includes
      -
        | mailnews/compose/\*\*
    * - Bugzilla Components
      - MailNews Core::Networking: SMTP


Unit Testing Infrastructure
===========================


.. list-table::
    :stub-columns: 1
    :widths: 30 70

    * - Owner(s)
      -
        | `Geoff Lankow (darktrojan) <https://people.mozilla.org/s?query=darktrojan>`__
    * - Peer(s)
      -
        | `Joshua Cranmer (jcranmer) <https://people.mozilla.org/s?query=jcranmer>`__
        | `Magnus Melin (mkmelin) <https://people.mozilla.org/s?query=mkmelin>`__
    * - Owner(s) Emeritus
      - Mark Banner
    * - Includes
      -
        | mailnews/test/\*\*
        | mailnews/base/test/\*\*
    * - Bugzilla Components
      - MailNews Core::Testing Infrastructure


mots config
~~~~~~~~~~~


.. list-table::
    :stub-columns: 1
    :widths: 30 70

    * - Owner(s)
      -
        | `Rob Lemley (rjl) <https://people.mozilla.org/s?query=rjl>`__
    * - Includes
      -
        | mots.yaml
