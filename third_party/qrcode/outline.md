# Outline-only QR Code

For a vector QR code that only uses stroke lines (no fill), replace the `<defs>` section of your *.svg* file with:

```svg
<style>
line, polyline, path, rect {
    stroke: currentColor;
    fill: none;
    stroke-linecap: round;
    stroke-width: 0.1;
}
</style>
<defs>

<!-- Filled data modules -->
<g id="b">
    <!-- Multiply cross -->
    <line x1="-0.25" y1="-0.25" x2="0.25" y2="0.25" />
    <line x1="0.25" y1="-0.25" x2="-0.25" y2="0.25" />
    <!-- Addition cross -->
    <line x1="-0.354" y1="0" x2="0.354" y2="0" />
    <line x1="0" y1="-0.354" x2="0" y2="0.354" />
</g>

<!-- Filled finder and alignment modules -->
<g id="bb">
    <!-- Zig-zag fill (not used) -->
    <!--
    <polyline points="-0.5,-0.5 -0.25,-0.5 -0.5,-0.25 -0.5,0 0,-0.5 0.25,-0.5 -0.5,0.25 -0.5,0.5 0.5,-0.5 0.5,-0.25 -0.25,0.5 0,0.5 0.5,0 0.5,0.25 0.25,0.5 0.5,0.5" stroke="currentColor" stroke-width="0.25" stroke-linecap="round" fill="none" />
    -->

    <!-- Forward slash hatch -->
    <line x1="-0.25" y1="-0.5" x2="-0.5" y2="-0.25" />
    <line x1="0" y1="-0.5" x2="-0.5" y2="0" />
    <line x1="0.25" y1="-0.5" x2="-0.5" y2="0.25" />
    <line x1="0.5" y1="-0.5" x2="-0.5" y2="0.5" />
    <line x1="0.5" y1="-0.25" x2="-0.25" y2="0.5" />
    <line x1="0.5" y1="0" x2="0" y2="0.5" />
    <line x1="0.5" y1="0.25" x2="0.25" y2="0.5" />

    <!-- Backward slash hatch -->
    <line x1="0.25" y1="-0.5" x2="0.5" y2="-0.25" />
    <line x1="0" y1="-0.5" x2="0.5" y2="0" />
    <line x1="-0.25" y1="-0.5" x2="0.5" y2="0.25" />
    <line x1="-0.5" y1="-0.5" x2="0.5" y2="0.5" />
    <line x1="-0.5" y1="-0.25" x2="0.25" y2="0.5" />
    <line x1="-0.5" y1="0" x2="0" y2="0.5" />
    <line x1="-0.5" y1="0.25" x2="-0.25" y2="0.5" />
</g>

<!-- Use the modules for finder/alignment -->
<use id="f" xlink:href="#bb" />
<use id="a" xlink:href="#bb" />

<!-- Do not use a particular shape for finder/alignment patterns -->
<path id="fc" d="" visibility="hidden" />
<path id="ac" d="" visibility="hidden" />

</defs>
```
