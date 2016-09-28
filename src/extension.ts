'use strict';
import * as vscode from 'vscode';
import * as say from 'say';

const getVoice = (): string =>
    vscode.workspace.getConfiguration('speech').get<string>('voice');

const getSpeed = (): number =>
    vscode.workspace.getConfiguration('speech').get<number>('speed');


const stopSpeaking = () => {
    say.stop();
}

const speakText = (text: string) => {
    text = text.trim();
    if (text.length > 0) {
        say.speak(text, getVoice(), getSpeed());
    }
};

const speakCurrentSelection = (editor: vscode.TextEditor) => {
    const selection = editor.selection;
    if (!selection)
        return;

    speakText(editor.document.getText(selection));
};

const speakDocument = (editor: vscode.TextEditor) => {
    speakText(editor.document.getText());
};


export function activate(context: vscode.ExtensionContext) {
    const speakDocumentCommand = vscode.commands.registerTextEditorCommand('speech.speakDocument', (editor) => {
        stopSpeaking();
        if (!editor)
            return;
        speakDocument(editor);
    });

    const speakSelectionCommand = vscode.commands.registerTextEditorCommand('speech.speakSelection', (editor) => {
        stopSpeaking();
        if (!editor)
            return;
        speakCurrentSelection(editor);
    });

    const stopSpeakingCommand = vscode.commands.registerCommand('speech.stopSpeaking', () => {
        stopSpeaking();
    });

    context.subscriptions.push(speakDocumentCommand);
    context.subscriptions.push(speakSelectionCommand);
    context.subscriptions.push(stopSpeakingCommand);
}

export function deactivate() {
}
