import * as vscode from 'vscode';
import { SpeechEngine, SpeechEnginePosition } from './SpeechEngine';
const getVoice = (): string =>
    vscode.workspace.getConfiguration('read-aloud-text').get<string>('voice');

const getSpeed = (): number =>
    vscode.workspace.getConfiguration('read-aloud-text').get<number>('speed');

let highlightDecorator: vscode.TextEditorDecorationType | null = null;
function highlightRange({
    startIndex,
    endIndex
}: {
        startIndex: number;
        endIndex: number;
    }) {

    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
        return;
    }
    const startPos = activeEditor.document.positionAt(startIndex);
    const endPos = activeEditor.document.positionAt(endIndex);
    const range = new vscode.Range(startPos, endPos);
    const decoration = {
        range: range
    };
    if (highlightDecorator) {
        highlightDecorator.dispose();
    }
    highlightDecorator = vscode.window.createTextEditorDecorationType({
        borderWidth: '1px',
        borderStyle: 'solid',
        overviewRulerColor: 'blue',
        overviewRulerLane: vscode.OverviewRulerLane.Right,
        backgroundColor: "yellow",
        light: {
            // this color will be used in light color themes
            borderColor: 'darkblue'
        },
        dark: {
            // this color will be used in dark color themes
            borderColor: 'lightblue'
        }
    });
    activeEditor.setDecorations(highlightDecorator, [decoration]);
    activeEditor.revealRange(range, vscode.TextEditorRevealType.InCenter);
}

let currentEngine: SpeechEngine | null = null;
const speech = {
    start(text: string, fileName: string, loc?: {
        start: SpeechEnginePosition,
        end: SpeechEnginePosition
    }) {
        this.stop();
        currentEngine = new SpeechEngine(text, fileName, loc);
        currentEngine.onChange((currentNode) => {
            console.log("curretNode", currentNode);
            highlightRange({
                startIndex: currentNode.range[0],
                endIndex: currentNode.range[1]
            });
        });
        currentEngine.start(getVoice(), getSpeed());
    },
    stop() {
        if (currentEngine) {
            currentEngine.reset();
        }
        if (highlightDecorator) {
            highlightDecorator.dispose();
        }
    }
};
const speakCurrentSelection = (editor: vscode.TextEditor) => {
    const selection = editor.selection;
    if (!selection)
        return;

    const startPos = editor.selection.start;
    const endPos = editor.selection.end;
    speech.start(editor.document.getText(), editor.document.fileName, {
        start: {
            line: startPos.line + 1,
            column: startPos.character
        },
        end: {
            line: endPos.line + 1,
            column: endPos.character
        }
    });
};

const speakDocument = (editor: vscode.TextEditor) => {
    speech.start(editor.document.getText(), editor.document.fileName);
};


export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerTextEditorCommand('read-aloud-text.speakDocument', (editor) => {
        console.log("read-aloud-text.speakDocument");
        speech.stop();
        if (!editor)
            return;
        speakDocument(editor);
    }));
    context.subscriptions.push(vscode.commands.registerTextEditorCommand('read-aloud-text.speakSelection', (editor) => {
        console.log("read-aloud-text.speakSelection");
        speech.stop();
        if (!editor)
            return;
        speakCurrentSelection(editor);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('read-aloud-text.stopSpeaking', () => {
        speech.stop();
    }));
}