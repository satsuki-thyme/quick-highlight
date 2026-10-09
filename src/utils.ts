
/* IMPORT */

import isEmptyPlainObject from 'plain-object-is-empty';
import isIntraline from 'regexp-is-intraline';
import vscode from 'vscode';
import {getConfig} from 'vscode-extras';
import {CONFIG_REGEXES_NORMALIZATION_MAP, HIGHLIGHTS_LIMIT} from './constants';
import DecorationTypes from './decoration-types';
import type {Change, ChangeShiftsMap, Highlight, Options} from './types';

/* MAIN */

const getChange = ( changes: readonly vscode.TextDocumentContentChangeEvent[] ): Change => {

  const rangesPrev = getChangeRangesPrev ( changes );
  const rangesNext = getChangeRangesNext ( changes );
  const shifts = getChangeShiftMap ( changes );

  return { rangesPrev, rangesNext, shifts };

};

const getChangeRangesPrev = ( changes: readonly vscode.TextDocumentContentChangeEvent[] ): vscode.Range[] => {

  return getWholeLineRangesMerged ( changes.map ( change => getRangeForWholeLines ( change.range ) ) );

};

const getChangeRangesNext = ( changes: readonly vscode.TextDocumentContentChangeEvent[] ): vscode.Range[] => {

  // All ranges describe the old document. Earlier edits move the lines scanned
  // in the final document, regardless of the order in contentChanges.
  const sorted = [...changes].sort ( ( a, b ) => a.range.start.compareTo ( b.range.start ) || a.range.end.compareTo ( b.range.end ) );
  let shift = 0;

  const ranges = sorted.map ( change => {

    const linesNr = getStringLinesNr ( change.text );

    const start = new vscode.Position ( change.range.start.line + shift, 0 );
    const end = new vscode.Position ( start.line + linesNr - 1, Infinity );
    const range = new vscode.Range ( start, end );

    shift += linesNr - getRangeLinesNr ( change.range );

    return range;

  });

  return getWholeLineRangesMerged ( ranges );

};

const getWholeLineRangesMerged = ( ranges: vscode.Range[] ): vscode.Range[] => {

  const merged: vscode.Range[] = [];

  for ( const range of ranges.sort ( ( a, b ) => a.start.line - b.start.line ) ) {

    const previous = merged[merged.length - 1];

    if ( previous && range.start.line <= previous.end.line ) {

      merged[merged.length - 1] = new vscode.Range ( previous.start.line, 0, Math.max ( previous.end.line, range.end.line ), Infinity );

    } else {

      merged.push ( range );

    }

  }

  return merged;

};

const getChangeShiftMap = ( changes: readonly vscode.TextDocumentContentChangeEvent[] ): ChangeShiftsMap | undefined => {

  if ( !changes.length ) return;

  const shifts: ChangeShiftsMap = { start: Infinity, end: -Infinity }; // A map of old line indices to line shifts caused by the change, with start and end markers for the range of lines we know about

  for ( const change of changes ) { // Computing shift points

    const linesPrev = getRangeLinesNr ( change.range );
    const linesNext = getStringLinesNr ( change.text );
    const linesShift = linesNext - linesPrev;

    if ( !linesShift ) continue;

    // Cached ranges still use OLD line indices; deleted lines must not move
    // this boundary upwards. Multiple edits ending on one line add together.
    const shiftLine = change.range.end.line + 1;

    shifts[shiftLine] = ( shifts[shiftLine] || 0 ) + linesShift;
    shifts.start = Math.min ( shifts.start, shiftLine );
    shifts.end = Math.max ( shifts.end, shiftLine );

  }

  if ( shifts.start === Infinity ) return;

  let accumulatedShift = shifts[shifts.start] || 0;

  for ( let i = shifts.start + 1; i <= shifts.end; i++ ) { // Populating between shift points

    accumulatedShift += shifts[i] || 0;

    shifts[i] = accumulatedShift;

  }

  return shifts;

};

const getHighlights = ( config: Record<string, unknown> | undefined, types: DecorationTypes ): Highlight[] => {

  const decorations = isObject ( config?.['decorations'] ) ? config['decorations'] : { rangeBehavior: 3 };
  const regexes = isObject ( config?.['regexes'] ) ? config['regexes'] : {};
  const regexFlags = isString ( config?.['regexFlags'] ) ? config['regexFlags'] : 'gi';

  const highlights: Highlight[] = [];

  for ( const [highlightReSource, highlightConfig] of Object.entries ( regexes ) ) {

    const highlightReSourceNormalized = CONFIG_REGEXES_NORMALIZATION_MAP[highlightReSource] ?? highlightReSource;

    const fileRe = isObject ( highlightConfig ) && isString ( highlightConfig['filterFileRegex'] ) ? getRegExp ( highlightConfig['filterFileRegex'], 'i', '' ) : undefined;
    const languageRe = isObject ( highlightConfig ) && isString ( highlightConfig['filterLanguageRegex'] ) ? getRegExp ( highlightConfig['filterLanguageRegex'], 'i', '' ) : undefined;
    const themeRe = isObject ( highlightConfig ) && isString ( highlightConfig['filterThemeRegex'] ) ? getRegExp ( highlightConfig['filterThemeRegex'], 'i', '' ) : undefined;

    const highlightReFlagsFallback = isObject ( highlightConfig ) && isString ( highlightConfig['regexFlags'] ) ? highlightConfig['regexFlags'] : regexFlags;
    const highlightReFlagsExtra = 'gd'; // + global + indices
    const highlightRe = getRegExp ( highlightReSourceNormalized, highlightReFlagsFallback, highlightReFlagsExtra );

    const highlightDecorationsRaw = isObject ( highlightConfig ) && isArray ( highlightConfig['decorations'] ) && highlightConfig['decorations'].every ( isObject ) ? highlightConfig['decorations'] : isArray ( highlightConfig ) && highlightConfig.every ( isObject ) ? highlightConfig : [];
    const highlightDecorationsRawNormalized = highlightDecorationsRaw.map ( decoration => ({ ...decorations, ...decoration }) );
    const highlightDecorations = highlightDecorationsRawNormalized.map ( decoration => types.get ( highlightRe, decoration ) );

    const highlightLimit = getRegExp ( highlightReSourceNormalized, highlightReFlagsFallback, '' ).global ? HIGHLIGHTS_LIMIT : 1;

    const isEnabled = isObject ( highlightConfig ) && isBoolean ( highlightConfig['enabled'] ) ? highlightConfig['enabled'] : true;
    const isIntraline = isRegExpIntraline ( highlightRe );

    const highlight: Highlight = {
      fileRe,
      languageRe,
      themeRe,
      highlightRe,
      highlightDecorations,
      highlightLimit,
      isEnabled,
      isIntraline
    };

    highlights.push ( highlight );

  }

  return highlights;

};

const getOptions = (): Options => {

  const config = getConfig<Record<string, unknown>> ( 'highlight' );
  const debugging = isBoolean ( config?.['debugging'] ) ? config['debugging'] : false;
  const enabled = isBoolean ( config?.['enabled'] ) ? config['enabled'] : true;
  const types = new DecorationTypes ();

  try {
    const highlights = enabled ? getHighlights ( config, types ) : [];
    return { debugging, enabled, highlights, dispose: () => types.dispose () };
  } catch ( error ) {
    types.dispose ();
    throw error;
  }

};

const getRangeForWholeDocument = ( document: vscode.TextDocument ): vscode.Range => {

  return new vscode.Range ( 0, 0, document.lineCount - 1, Infinity );

};

const getRangeForWholeLines = ( range: vscode.Range ): vscode.Range => {

  return new vscode.Range ( range.start.line, 0, range.end.line, Infinity );

};

const getRangeLinesNr = ( range: vscode.Range ): number => {

  return 1 + ( range.end.line - range.start.line );

};

const getRangeShifted = ( range: vscode.Range, shifts?: ChangeShiftsMap ): vscode.Range => {

  if ( !shifts ) return range;

  const line = range.start.line;
  const shift = ( line in shifts ) ? shifts[line] : line < shifts.start ? 0 : shifts[shifts.end] || 0;

  const start = new vscode.Position ( range.start.line + shift, range.start.character );
  const end = new vscode.Position ( range.end.line + shift, range.end.character );
  const rangeShifted = new vscode.Range ( start, end );

  return rangeShifted;

};

const getRegExp = ( value: string, flagsFallback: string, flagsExtra: string ): RegExp => {

  const regexRe = /^\/(.*)\/([gimsuvyd]*)$/;
  const match = value.match ( regexRe );

  if ( match ) { // /source/flags

    const source = match[1];
    const flags = uniqChars ( `${match[2]}${flagsExtra}` );

    return new RegExp ( source, flags );

  } else { // source

    const flags = uniqChars ( `${flagsFallback}${flagsExtra}` );

    return new RegExp ( value, flags );

  }

};

const getStringLinesNr = (() => {

  const newlineRe = /\r?\n|\r/g;

  return ( value: string ): number => {

    let linesNr = 1;

    while ( newlineRe.exec ( value ) ) {

      linesNr += 1;

    }

    return linesNr;

  };

})();

const isArray = ( value: unknown ): value is unknown[] => {

  return Array.isArray ( value );

};

const isBoolean = ( value: unknown ): value is boolean => {

  return typeof value === 'boolean';

};

const isNumber = ( value: unknown ): value is number => {

  return typeof value === 'number';

};

const isObject = ( value: unknown ): value is Record<string, unknown> => {

  return typeof value === 'object' && value !== null;

};

const isRegExp = ( value: unknown ): value is RegExp => {

  return value instanceof RegExp;

};

const isRegExpIntraline = ( regex: RegExp ): boolean => {

  return isIntraline ( regex );

};

const isString = ( value: unknown ): value is string => {

  return typeof value === 'string';

};

const uniq = <T> ( values: T[] ): T[] => {

  return Array.from ( new Set ( values ) );

};

const uniqChars = ( value: string ): string => {

  return uniq ( value.split ( '' ) ).join ( '' );

};

/* EXPORT */

export {getChange, getChangeRangesPrev, getChangeRangesNext, getChangeShiftMap};
export {getOptions, getRangeForWholeDocument, getRangeForWholeLines, getRangeLinesNr, getRangeShifted, getRegExp, getStringLinesNr};
export {isArray, isBoolean, isEmptyPlainObject, isNumber, isObject, isRegExp, isRegExpIntraline, isString, uniq, uniqChars};
