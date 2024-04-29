# Building documentation locally

In the top directory (gecko):

```sh
./mach tb-doc
```

Command Arguments:
-  --format FMT          Documentation format to write.
-  --outdir DESTINATION  Where to write output.
-  --no-open             Don't automatically open HTML docs in a browser.
-  --no-serve            Don't serve the generated docs after building.
-  --http ADDRESS        Serve documentation on the specified host and port, default "localhost:5500".
-  -j JOBS, --jobs JOBS  Distribute the build over N processes in parallel.
-  --verbose             Run Sphinx in verbose mode
-  --no-autodoc          Disable generating Python/JS API documentation
