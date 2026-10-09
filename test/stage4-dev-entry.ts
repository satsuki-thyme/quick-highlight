// This entry point is bundled ONLY by STAGE4_LAUNCH_TEST_WIN.ps1.
// The production entry remains src/index.ts; no diagnostic command or log is shipped.
import vscode from 'vscode';
import {appendFileSync} from 'node:fs';
import {join} from 'node:path';
import {activate as activateProduct} from '../src/index';

const command = 'quickHighlight.stage4.nextCheck';

const activate = ( context: vscode.ExtensionContext ): void => {
  activateProduct ( context );
  const logPath = join ( context.extensionPath, '..', 'RUN_EVENTS.jsonl' );
  let step = 0;
  let running = false;
  let status: vscode.Disposable | undefined;

  const record = ( event: string ): void => {
    const config = vscode.workspace.getConfiguration ( 'highlight' );
    appendFileSync ( logPath, JSON.stringify ( {
      time: new Date ().toISOString (), event, step,
      enabled: config.get ( 'enabled' ), regexFlags: config.get ( 'regexFlags' ), regexes: config.get ( 'regexes' ),
      theme: vscode.workspace.getConfiguration ( 'workbench' ).get ( 'colorTheme' ),
      visible: vscode.window.visibleTextEditors.map ( editor => ( {
        uri: editor.document.uri.toString (), languageId: editor.document.languageId, version: editor.document.version
      } ) )
    } ) + '\n' );
  };

  const applyStep = async (): Promise<void> => {
    if ( running ) return;
    if ( step >= 12 ) {
      void vscode.window.showInformationMessage ( 'Stage 4 checks finished. Record the results in STAGE4_PHYSICAL_DEVICE_CHECK.md.' );
      return;
    }
    running = true;
    step++;
    const config = vscode.workspace.getConfiguration ( 'highlight' );
    const target = vscode.ConfigurationTarget.Workspace;
    const colors: Record<string, unknown> = { decorations: [{ backgroundColor: '$1' }] };
    const red: Record<string, unknown> = { decorations: [{ backgroundColor: 'rgba(0,180,0,0.45)', fontWeight: 'bold' }] };
    let regexes: Record<string, unknown> = { '(QH_RED)': red, '(#[0-9a-f]{6})': colors };
    let flags = 'g';
    let enabled = true;
    let theme = 'Default Dark Modern';
    const expectations = [
      '',
      '1/12: QH_RED and qh_red are GREEN in both editors.',
      '2/12: Only uppercase QH_RED stays GREEN.',
      '3/12: QH_RED disappears (javascript filter; fixture is markdown).',
      '4/12: QH_RED returns GREEN (markdown filter).',
      '5/12: All highlights disappear (disabled).',
      '6/12: QH_RED and hex colors return (enabled).',
      '7/12: Light theme: QH_RED disappears; hex colors remain.',
      '8/12: Dark theme: QH_RED returns GREEN.',
      '9/12: Hex color highlights disappear; QH_RED stays GREEN.',
      '10/12: QH_RED and qh_red are RED; hex colors return.',
      '11/12: Invalid regex warning; the previous highlights stay visible.',
      '12/12: Corrected settings: uppercase QH_RED is GREEN again.'
    ];
    if ( step === 1 ) flags = 'gi';
    if ( step === 3 ) red['filterLanguageRegex'] = '^javascript$';
    if ( step === 4 ) red['filterLanguageRegex'] = '^markdown$';
    if ( step === 5 ) enabled = false;
    if ( step === 7 || step === 8 ) red['filterThemeRegex'] = 'Dark';
    if ( step === 7 ) theme = 'Default Light Modern';
    if ( step === 9 ) delete regexes['(#[0-9a-f]{6})'];
    if ( step === 10 || step === 11 ) {
      flags = 'gi';
      red['decorations'] = [{ backgroundColor: 'rgba(255,0,0,0.45)', fontWeight: 'bold' }];
    }
    if ( step === 11 ) regexes = { '[': [{ color: '#ffffff' }] };
    try {
      await config.update ( 'enabled', enabled, target );
      await config.update ( 'regexFlags', flags, target );
      await config.update ( 'regexes', regexes, target );
      await vscode.workspace.getConfiguration ( 'workbench' ).update ( 'colorTheme', theme, target );
      status?.dispose ();
      status = vscode.window.setStatusBarMessage ( `Quick Highlight ${expectations[step]}` );
      record ( `step-complete: ${expectations[step]}` );
    } catch ( error ) {
      record ( 'step-failed' );
      void vscode.window.showErrorMessage ( `Stage 4 test failed: ${String ( error )}` );
    } finally {
      running = false;
    }
  };

  context.subscriptions.push (
    vscode.commands.registerCommand ( command, applyStep ),
    vscode.workspace.onDidChangeConfiguration ( event => {
      if ( event.affectsConfiguration ( 'highlight' ) || event.affectsConfiguration ( 'workbench.colorTheme' ) ) record ( 'configuration' );
    } ),
    vscode.workspace.onDidOpenTextDocument ( () => record ( 'document-open' ) ),
    vscode.window.onDidChangeVisibleTextEditors ( () => record ( 'visible-editors' ) ),
    { dispose: () => status?.dispose () }
  );
  record ( 'activated' );
  status = vscode.window.setStatusBarMessage ( 'Quick Highlight Stage 4: split the fixture, then press F6 for each check (12 steps).' );
};

export {activate};
