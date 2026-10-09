
/* IMPORT */

import MildMap from 'mild-map';
import vscode from 'vscode';
import {alert, getConfig} from 'vscode-extras';
import {getRangeForWholeDocument, getRangeLinesNr, getRangeShifted} from './utils';
import type {Change, Options} from './types';

/* HELPERS */

type EditorCache = {
  document: vscode.TextDocument,
  version: number,
  options: Options,
  languageId: string,
  filePath: string,
  theme: string,
  highlights: Map<RegExp, Map<vscode.TextEditorDecorationType, vscode.Range[]>>
};

const EDITOR_REGEX_DECORATION_RANGES_CACHE = new MildMap<vscode.TextEditor, EditorCache>();

const matchesFilter = ( regex: RegExp, value: string ): boolean => {

  // Filters are predicates, even when /source/g or /source/y was configured.
  regex.lastIndex = 0;
  return regex.test ( value );

};

/* MAIN */

const decorateWithoutProfiler = ( editor: vscode.TextEditor, options: Options, change?: Change ): number => {

  /* INIT */

  const document = editor.document;
  const theme = getConfig<string>( 'workbench.colorTheme' ) || 'Default';

  const cache = EDITOR_REGEX_DECORATION_RANGES_CACHE.get ( editor );
  const highlightsPrev = cache?.highlights;
  const highlightsNext = new Map<RegExp, Map<vscode.TextEditorDecorationType, vscode.Range[]>>();

  const sameContext = cache?.document === document && cache.options === options && cache.languageId === document.languageId && cache.filePath === document.uri.fsPath && cache.theme === theme;

  if ( sameContext && cache.version === document.version ) return 0; // Already decorated at this version

  // A hidden editor can miss several changes. Only the immediately preceding
  // document version can be updated with this transaction's old coordinates.
  const canUpdatePrevious = sameContext && cache.version === document.version - 1;

  /* COMPUTING DECORATIONS */

  const {highlights} = options;

  for ( const highlight of highlights ) {

    const {fileRe, languageRe, themeRe, highlightRe} = highlight;
    const {highlightDecorations, highlightLimit, isEnabled, isIntraline} = highlight;

    /* FILTERING */

    if ( !isEnabled ) continue;
    if ( languageRe && !matchesFilter ( languageRe, document.languageId ) ) continue;
    if ( fileRe && !matchesFilter ( fileRe, document.uri.fsPath ) ) continue;
    if ( themeRe && !matchesFilter ( themeRe, theme ) ) continue;

    /* PREPARING */

    const isPartial = change?.rangesNext.length && isIntraline && canUpdatePrevious;

    const highlightRanges = isPartial ? change.rangesNext : [getRangeForWholeDocument ( document )];
    const decorationsNext = highlightsNext.get ( highlightRe ) || new Map<vscode.TextEditorDecorationType, vscode.Range[]>();

    highlightsNext.set ( highlightRe, decorationsNext );

    /* PRESERVING OLD DECORATIONS */

    if ( isPartial ) {

      const changedRanges = change?.rangesPrev || [];
      const decorationsPrev = highlightsPrev?.get ( highlightRe );

      if ( decorationsPrev ) {

        for ( const [decorationPrev, rangesPrev] of decorationsPrev ) {

          if ( !rangesPrev.length ) continue;

          const rangesFilteredNext = rangesPrev.filter ( rangePrev => changedRanges.every ( range => !range.intersection ( rangePrev ) ) );

          if ( !rangesFilteredNext.length ) continue;

          const rangesShiftedNext = change.shifts ? rangesFilteredNext.map ( range => getRangeShifted ( range, change.shifts ) ) : rangesFilteredNext; // Shift ranges according to changes

          if ( !rangesShiftedNext.length ) continue;

          decorationsNext.set ( decorationPrev, rangesShiftedNext );

        }

      }

    }

    /* COMPUTING NEW DECORATIONS */

    for ( const highlightRange of highlightRanges ) {

      const highlightRangeOffset = document.offsetAt ( highlightRange.start );

      const text = document.getText ( highlightRange );

      let highlightMatches = 0;

      for ( const match of text.matchAll ( highlightRe ) ) {

        const indicesAll = match.indices && match.indices.length > 1 ? match.indices : [[], [match.index, match.index + match[0].length]]; // Fallback for regexes without capturing groups

        for ( let i = 1, l = indicesAll.length; i < l; i++ ) {

          const indices = indicesAll[i];
          const highlightDecoration = highlightDecorations[i - 1];

          if ( !indices || !highlightDecoration ) continue;

          const startIndex = indices[0];
          const endIndex = indices[1];

          if ( startIndex === endIndex ) continue;

          const startPosition = document.positionAt ( highlightRangeOffset + startIndex );
          const endPosition = document.positionAt ( highlightRangeOffset + endIndex );

          const decoration = highlightDecoration ( match );

          const range = new vscode.Range ( startPosition, endPosition );
          const ranges = decorationsNext.get ( decoration ) || [];

          ranges.push ( range );
          decorationsNext.set ( decoration, ranges );

        }

        if ( ++highlightMatches >= highlightLimit ) {

          break;

        }

      }

    }

  }

  /* REMOVING OLD DECORATIONS */

  if ( highlightsPrev ) {

    for ( const [highlightPrev, decorationsPrev] of highlightsPrev ) {

      for ( const decorationPrev of decorationsPrev.keys () ) {

        if ( highlightsNext.get ( highlightPrev )?.has ( decorationPrev ) ) continue; // It will be updated later

        editor.setDecorations ( decorationPrev, [] );

      }

    }

  }

  /* UPDATING OTHER DECORATIONS */

  let decorationsNr = 0;

  for ( const highlightNext of highlightsNext.values () ) {

    for ( const [decorationNext, rangesNext] of highlightNext ) {

      editor.setDecorations ( decorationNext, rangesNext );

      decorationsNr += rangesNext.length;

    }

  }

  EDITOR_REGEX_DECORATION_RANGES_CACHE.set ( editor, { document, version: document.version, options, languageId: document.languageId, filePath: document.uri.fsPath, theme, highlights: highlightsNext } );

  return decorationsNr;

};

const decorateWithProfiler = ( editor: vscode.TextEditor, options: Options, change?: Change ): void => {

  const highlights = options.highlights.filter ( highlight => highlight.isEnabled );
  const intralineNr = highlights.filter ( highlight => highlight.isIntraline ).length;
  const interlineNr = highlights.filter ( highlight => !highlight.isIntraline ).length;

  const changeLinesNr = change?.rangesNext.reduce ( ( sum, range ) => sum + getRangeLinesNr ( range ), 0 ) || 0;
  const cache = EDITOR_REGEX_DECORATION_RANGES_CACHE.get ( editor );
  const sameContext = cache?.document === editor.document && cache.options === options && cache.languageId === editor.document.languageId && cache.filePath === editor.document.uri.fsPath && cache.theme === ( getConfig<string> ( 'workbench.colorTheme' ) || 'Default' );
  const isCurrent = sameContext && cache.version === editor.document.version;
  const canUpdatePrevious = sameContext && cache.version === editor.document.version - 1;
  const linesNr = isCurrent ? 0 : interlineNr || !change || !canUpdatePrevious ? editor.document.lineCount : changeLinesNr;

  const start = performance.now ();

  const decorationsNr = decorateWithoutProfiler ( editor, options, change );

  const end = performance.now ();
  const elapsed = Number ( ( end - start ).toFixed ( 2 ) );

  alert.info ( `${elapsed}ms - ${linesNr} lines - ${decorationsNr} decorations - ${intralineNr} intralines - ${interlineNr} interlines` );

};

const decorate = ( editor: vscode.TextEditor, options: Options, change?: Change ): void => {

  if ( !options.enabled ) return;

  if ( options.debugging ) {

    decorateWithProfiler ( editor, options, change );

  } else {

    decorateWithoutProfiler ( editor, options, change );

  }

};

const decorateAll = ( options: Options ): void => {

  for ( const editor of vscode.window.visibleTextEditors ) {

    decorate ( editor, options );

  }

};

const undecorate = ( editor: vscode.TextEditor ): void => {

  const highlightsPrev = EDITOR_REGEX_DECORATION_RANGES_CACHE.get ( editor )?.highlights;

  if ( !highlightsPrev ) return;

  for ( const highlightPrev of highlightsPrev.values () ) {

    for ( const decorationPrev of highlightPrev.keys () ) {

      editor.setDecorations ( decorationPrev, [] );

    }

  }

  EDITOR_REGEX_DECORATION_RANGES_CACHE.delete ( editor );

};

const undecorateAll = (): void => {

  for ( const editor of EDITOR_REGEX_DECORATION_RANGES_CACHE.keys () ) {

    undecorate ( editor );

  }

};

const undecorateDocument = ( document: vscode.TextDocument ): void => {

  for ( const [editor, cache] of EDITOR_REGEX_DECORATION_RANGES_CACHE ) {
    if ( cache.document === document ) undecorate ( editor );
  }

};

/* EXPORT */

export {decorate, decorateAll, undecorate, undecorateAll, undecorateDocument};
