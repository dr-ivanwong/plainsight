"""The audited ASX universe for the pairs scan.

Fifty large caps, checked ticker by ticker against the ASX
listed-companies directory as at 2026-07-22 (pairs trading plan, Week 1,
the universe audit). Re-run that audit whenever this list is picked up
after a gap: tickers rename and delist, and a downloader that skips
failures quietly shrinks the universe. Choosing today's constituents for
a five-year lookback is survivorship bias, accepted and recorded by the
plan for the proof of concept.
"""

AUDITED_AS_AT = "2026-07-22"

UNIVERSE: tuple[str, ...] = (
    "CBA", "NAB", "ANZ", "WBC", "BOQ",
    "BHP", "RIO", "FMG", "NST", "S32",
    "CSL", "WES", "COL", "SHL", "AZJ",
    "TLS", "ORG", "TCL", "APA", "STO",
    "MQG", "ALL", "QBE", "NHF", "MGR",
    "AGL", "ASX", "IAG", "ILU", "GMG",
    "SEK", "CGF", "ALX", "CDA", "WHC",
    "DXS", "REA", "ORI", "SCG", "VCX",
    "EVN", "LLC", "GPT", "WOW", "CWY",
    "NXT", "WTC", "SGP", "EQT", "XRO",
)
