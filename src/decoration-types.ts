
/* IMPORT */

import vscode from 'vscode';
import type {Decoration} from './types';

/* MAIN */

// One owner per options generation. No module-wide cache may retain a type
// after a configuration change or extension shutdown.
class DecorationTypes {

  private caches = new Map<RegExp, Map<string, vscode.TextEditorDecorationType>> ();
  private disposed = false;

  get ( regex: RegExp, options: vscode.DecorationRenderOptions ): Decoration {

    const serialized = JSON.stringify ( options );
    const dynamic = /\$\d+/.test ( serialized );

    return ( match: RegExpExecArray ): vscode.TextEditorDecorationType => {

      if ( this.disposed ) throw new Error ( 'Decoration options have been disposed' );

      // Escape capture text within its JSON string, including quotes, newlines
      // and backslashes. Key by the resolved style rather than match.join('-').
      const resolved = dynamic ? serialized.replace ( /\$(\d+)/g, ( _, index ) => JSON.stringify ( match[Number ( index )] ?? '' ).slice ( 1, -1 ) ) : serialized;
      let cache = this.caches.get ( regex );

      if ( !cache ) {
        cache = new Map ();
        this.caches.set ( regex, cache );
      }

      let decoration = cache.get ( resolved );

      if ( !decoration ) {
        decoration = vscode.window.createTextEditorDecorationType ( withThemeColors ( JSON.parse ( resolved ) ) );
        cache.set ( resolved, decoration );
      }

      return decoration;

    };

  }

  dispose (): void {

    if ( this.disposed ) return;
    this.disposed = true;

    for ( const cache of this.caches.values () ) {
      for ( const decoration of cache.values () ) decoration.dispose ();
      cache.clear ();
    }

    this.caches.clear ();

  }

}

const withThemeColors = ( options: vscode.DecorationRenderOptions ): vscode.DecorationRenderOptions => {

  const result = { ...options };

  for ( const key of ['before', 'after', 'light', 'dark'] as const ) {
    const value = result[key];
    if ( typeof value === 'object' && value !== null ) result[key] = withThemeColors ( value );
  }

  for ( const key of ['backgroundColor', 'borderColor', 'color', 'outlineColor', 'overviewRulerColor'] as const ) {
    const value = result[key];
    if ( typeof value === 'string' && value.startsWith ( 'theme.' ) ) result[key] = new vscode.ThemeColor ( value.slice ( 6 ) );
  }

  return result;

};

/* EXPORT */

export default DecorationTypes;
