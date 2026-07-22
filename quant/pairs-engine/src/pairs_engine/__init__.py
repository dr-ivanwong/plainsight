"""Plainsight pairs sleeve: the quant engine.

Python ends where artefacts are written (docs/adr/0005): this package
computes; the app renders. Nothing here is imported by any serving path,
and the app never trades and never writes sleeve data.
"""

ENGINE_VERSION = "0.1.0"
