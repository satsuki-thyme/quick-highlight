
/* IMPORT */

import vscode from 'vscode';
import * as Commands from './commands';
import {decorate, decorateAll, undecorateAll, undecorateDocument} from './decoration';
import {getChange, getOptions} from './utils';
import type {Options} from './types';

/* MAIN */

const activate = ( context: vscode.ExtensionContext ): void => {

  const isInited = context.globalState.get<boolean> ( 'inited', false );

  if ( !isInited ) {
    Commands.init ();
    context.globalState.update ( 'inited', true );
  }

  let options: Options | undefined;

  const reload = (): void => {

    let next: Options;

    try {
      // Validate the complete new settings before removing the working view.
      next = getOptions ();
    } catch {
      void vscode.window.showErrorMessage ( 'Quick Highlight: Invalid highlight settings. Check regular expressions and flags; the last valid settings remain active.' );
      return;
    }

    undecorateAll ();
    options?.dispose ();
    options = next;
    decorateAll ( options );

  };

  context.subscriptions.push (
    vscode.commands.registerCommand ( 'highlight.enable', Commands.enable ),
    vscode.commands.registerCommand ( 'highlight.disable', Commands.disable ),
    vscode.commands.registerCommand ( 'highlight.toggle', Commands.toggle ),

    vscode.window.onDidChangeActiveTextEditor ( editor => {
      if ( editor && options ) decorate ( editor, options );
    } ),

    vscode.window.onDidChangeVisibleTextEditors ( editors => {
      if ( !options ) return;
      for ( const editor of editors ) decorate ( editor, options );
    } ),

    vscode.workspace.onDidChangeTextDocument ( event => {
      if ( !options || !event.contentChanges.length ) return;
      const editors = vscode.window.visibleTextEditors.filter ( editor => editor.document === event.document );
      if ( !editors.length ) return;
      const change = getChange ( event.contentChanges );
      for ( const editor of editors ) decorate ( editor, options, change );
    } ),

    // VS Code emits close/open when a document's language is changed.
    vscode.workspace.onDidCloseTextDocument ( document => undecorateDocument ( document ) ),
    vscode.workspace.onDidOpenTextDocument ( document => {
      if ( !options ) return;
      for ( const editor of vscode.window.visibleTextEditors ) {
        if ( editor.document === document ) decorate ( editor, options );
      }
    } ),

    vscode.workspace.onDidChangeConfiguration ( event => {
      if ( event.affectsConfiguration ( 'highlight' ) || event.affectsConfiguration ( 'workbench.colorTheme' ) ) reload ();
    } ),

    { dispose: () => {
      undecorateAll ();
      options?.dispose ();
      options = undefined;
    } }
  );

  reload ();

};

/* EXPORT */

export {activate};
