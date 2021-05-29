/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const RES_PFX = "http://home.netscape.com/NC-irc#";

const nsIRDFResource = Components.interfaces.nsIRDFResource;
const nsIRDFNode = Components.interfaces.nsIRDFNode;

function initRDF()
{
    client.rdf = new RDFHelper();

    client.rdf.initTree("user-list");
    client.rdf.setTreeRoot("user-list", client.rdf.resNullChan);
}

function RDFHelper()
{
    const RDF_MEMORYDS_CONTRACTID =
        "@mozilla.org/rdf/datasource;1?name=in-memory-datasource";
    const RDF_DS_IID = Components.interfaces.nsIRDFDataSource;

    const RDF_DS_CONTRACTID = "@mozilla.org/rdf/rdf-service;1";
    const RDF_SVC_IID = Components.interfaces.nsIRDFService;

    this.ds =
        Components.classes[RDF_MEMORYDS_CONTRACTID].createInstance(RDF_DS_IID);
    this.svc =
        Components.classes[RDF_DS_CONTRACTID].getService(RDF_SVC_IID);

    /* predefined nodes */
    this.resRoot     = this.svc.GetResource ("NC:chatzilla-data");
    this.resNullUser = this.svc.GetResource (RES_PFX + "NUSER");
    this.resNullChan = this.svc.GetResource (RES_PFX + "NCHAN");

    /* predefined arcs */
    this.resNetwork  = this.svc.GetResource (RES_PFX + "network");
    this.resServer   = this.svc.GetResource (RES_PFX + "server");
    this.resChannel  = this.svc.GetResource (RES_PFX + "channel");
    this.resChanUser = this.svc.GetResource (RES_PFX + "chanuser");
    this.resSortName = this.svc.GetResource (RES_PFX + "sortname");
    this.resFounder  = this.svc.GetResource (RES_PFX + "founder");
    this.resAdmin    = this.svc.GetResource (RES_PFX + "admin");
    this.resOp       = this.svc.GetResource (RES_PFX + "op");
    this.resHalfOp   = this.svc.GetResource (RES_PFX + "halfop");
    this.resVoice    = this.svc.GetResource (RES_PFX + "voice");
    this.resNick     = this.svc.GetResource (RES_PFX + "nick");
    this.resUniName  = this.svc.GetResource (RES_PFX + "unicodeName");
    this.resUser     = this.svc.GetResource (RES_PFX + "user");
    this.resAway     = this.svc.GetResource (RES_PFX + "away");
    this.resHost     = this.svc.GetResource (RES_PFX + "host");

    /* predefined literals */
    this.litTrue     = this.svc.GetLiteral ("true");
    this.litFalse    = this.svc.GetLiteral ("false");
    this.litUnk      = this.svc.GetLiteral ("");

    this.ds.Assert (this.resNullUser, this.resFounder, this.litFalse, true);
    this.ds.Assert (this.resNullUser, this.resAdmin, this.litFalse, true);
    this.ds.Assert (this.resNullUser, this.resOp, this.litFalse, true);
    this.ds.Assert (this.resNullUser, this.resHalfOp, this.litFalse, true);
    this.ds.Assert (this.resNullUser, this.resVoice, this.litFalse, true);
    this.ds.Assert (this.resNullUser, this.resNick, this.litUnk, true);
    this.ds.Assert (this.resNullUser, this.resUniName, this.litUnk, true);
    this.ds.Assert (this.resNullUser, this.resUser, this.litUnk, true);
    this.ds.Assert (this.resNullUser, this.resAway, this.litFalse, true);
    this.ds.Assert (this.resNullUser, this.resHost, this.litUnk, true);
    this.ds.Assert (this.resRoot, this.resChannel, this.resNullChan, true);
    //this.ds.Assert (this.resNullChan, this.resChanUser, this.resNullUser,
    //                true);
}

RDFHelper.prototype.GetResource =
function rdf_getr (s)
{
    return this.svc.GetResource(s);
}

RDFHelper.prototype.GetLiteral =
function rdf_getl (s)
{
    return this.svc.GetLiteral(s);
}

RDFHelper.prototype.Assert =
function rdf_assert (n1, a, n2, f)
{

    if (typeof f == "undefined")
        f = true;

        //return this.dAssert (n1, a, n2, f);
    return this.ds.Assert (n1, a, n2, f);
}

RDFHelper.prototype.Unassert =
function rdf_uassert (n1, a, n2)
{
    /*return this.dUnassert (n1, a, n2);*/
    return this.ds.Unassert (n1, a, n2);
}

RDFHelper.prototype.dAssert =
function rdf_dassert (n1, a, n2, f)
{
    var n1v = n1 ? n1.Value : "!!!";
    var av = a ? a.Value : "!!!";
    var n2v = n2 ? n2.Value : "!!!";

    if (!n1 || !a || !n2)
        dd(getStackTrace());

    this.ds.Assert (n1, a, n2, f)
}

RDFHelper.prototype.dUnassert =
function rdf_duassert (n1, a, n2)
{

    var n1v = n1 ? n1.Value : "!!!";
    var av = a ? a.Value : "!!!";
    var n2v = n2 ? n2.Value : "!!!";

    if (!n1 || !a || !n2)
        dd(getStackTrace());

    this.ds.Unassert (n1, a, n2)

}

RDFHelper.prototype.Change =
function rdf_change (n1, a, n2)
{

    var oldN2 = this.ds.GetTarget (n1, a, true);
    if (!ASSERT(oldN2, "Unable to change " + n1.Value + " -[" + a.Value +
                "]->, " + "because old value was not found."))
    {
        return null;
    }

    return this.ds.Change (n1, a, oldN2, n2);

}

RDFHelper.prototype.clearTargets =
function rdf_cleart (n1, a, recurse)
{
    if (typeof recurse == "undefined")
        recurse = false;

    var targets = this.ds.GetTargets(n1, a, true);

    while (targets.hasMoreElements())
    {
        var n2 = targets.getNext().QueryInterface(nsIRDFNode);

        if (recurse)
        {
            try
            {
                var resN2 = n2.QueryInterface(nsIRDFResource);
                var arcs = this.ds.ArcLabelsOut(resN2);

                while (arcs.hasMoreElements())
                {
                    var arc = arcs.getNext().QueryInterface(nsIRDFNode);
                    this.clearTargets (resN2, arc, true);
                }
            }
            catch (e)
            {
                /*
                ASSERT(0, "Caught " + e + " while recursivley clearing " +
                       n2.Value + " **");
                */
            }
        }

        this.Unassert (n1, a, n2);
    }
}


RDFHelper.prototype.initTree =
function rdf_inittree (id)
{
    var tree = document.getElementById (id);
    tree.database.AddDataSource (this.ds);
}

RDFHelper.prototype.setTreeRoot =
function rdf_settroot (id, root)
{
    var tree = document.getElementById (id);

    if (typeof root == "object")
        root = root.Value;
    tree.setAttribute ("ref", root);
}

RDFHelper.prototype.getTreeRoot =
function rdf_gettroot (id, root)
{
    var tree = document.getElementById (id);

    return tree.getAttribute ("ref");
}
