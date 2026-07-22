/**
 * The screener needs width for its columns; below this the rows always
 * render (finance-look gap plan §5). The constant lives alone so the root
 * shell can read it for the wide-column borrow without pulling the library
 * feature's whole module graph into the entry bundle (main plan §5, the
 * bundle gate).
 */
export const LIBRARY_WIDE_MEDIA = 'screen and (min-width: 900px)';
