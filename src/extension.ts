import * as vscode from 'vscode';
import * as say from 'say';
import { TxtNode, TxtParentNode, ASTNodeTypes } from "@textlint/ast-node-types";
import { createParser } from './parser';
import { traverse, Controller, VisitorOption } from "@textlint/ast-traverse";
import { splitAST, Syntax as SentenceSyntax } from "sentence-splitter"
const StringSource = require("textlint-util-to-string");
import PQueue = require('p-queue');
import { EventEmitter } from 'events';
const getVoice = (): string =>
    vscode.workspace.getConfiguration('speech').get<string>('voice');

const getSpeed = (): number =>
    vscode.workspace.getConfiguration('speech').get<number>('speed');

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
class SpeechEngine extends EventEmitter {
    private txtAST: TxtNode;
    private txtNodes: TxtNode[];
    private speechIndex: number;
    private promiseQueue: PQueue<PQueue.DefaultAddOptions>;
    constructor(private text: string, filePath: string, startPosition?: { line: number; column: number }) {
        super();
        const parser = createParser([
            {
                pluginId: "markdown",
                plugin: require("@textlint/textlint-plugin-markdown")
            }
        ]);
        this.speechIndex = 0;
        this.txtAST = parser.parse(text, filePath);
        const txtNodes: TxtNode[] = [];
        const isBeforeStart = (node: TxtNode): boolean => {
            if (!startPosition) {
                return false;
            }
            if (startPosition.line === node.loc.end.line &&
                startPosition.column > node.loc.end.column) {
                return true;
            } else if (startPosition.line > node.loc.end.line) {
                return true;
            }
            return false;
        }
        traverse(this.txtAST as TxtParentNode, {
            enter(node) {
                if (isBeforeStart(node)) {
                    return;
                }
                const ignoreNodeTypes: string[] = [
                    ASTNodeTypes.Document,
                    ASTNodeTypes.Comment,
                    ASTNodeTypes.Html,
                    ASTNodeTypes.HtmlBlock,
                    ASTNodeTypes.List, // ListItem is body
                    ASTNodeTypes.Strong,
                    ASTNodeTypes.Emphasis,
                    ASTNodeTypes.BlockQuote,
                    ASTNodeTypes.Header,
                    ASTNodeTypes.HorizontalRule,
                    ASTNodeTypes.CodeBlock
                ];
                if (node.type === ASTNodeTypes.Paragraph) {
                    const parentNode = splitAST(node as TxtParentNode);
                    parentNode.children.forEach(node => {
                        if (isBeforeStart(node)) {
                            return;
                        }
                        if (node.type === SentenceSyntax.Sentence) {
                            txtNodes.push(node);
                        }
                    });
                    return VisitorOption.Skip;
                }
                if (!ignoreNodeTypes.includes(node.type)) {
                    txtNodes.push(node);
                }
            }
        });
        this.txtNodes = txtNodes;
        this.promiseQueue = new PQueue({ concurrency: 1 });
    }

    onChange(handler: (currentSpeechNode: TxtNode) => void) {
        this.on("CHANGE", (index: number) => {
            handler(this.txtNodes[index]);
        });
    }

    start() {
        this.txtNodes.slice(this.speechIndex).forEach((node, index) => {
            const text: string = node.raw
            this.promiseQueue.add(() => {
                this.emit("CHANGE", this.speechIndex);
                return speakText(text).then(() => {
                    // update index after finishing speech
                    this.speechIndex++;
                });
            });
        });
    }

    pause() {
        this.promiseQueue.clear();
    }

    reset() {
        this.pause();
        this.speechIndex = 0;
    }
}

const stopSpeaking = () => {
    say.stop();
}

const speakText = (text: string): Promise<void> => {
    text = text.trim();
    if (text.length > 0) {
        return new Promise((resolve, reject) => {
            say.speak(text, getVoice(), getSpeed(), (error: any) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    }
    return Promise.resolve();
};

const speakCurrentSelection = (editor: vscode.TextEditor) => {
    const selection = editor.selection;
    if (!selection)
        return;

    const position = editor.selection.active;
    const engine = new SpeechEngine(editor.document.getText(), editor.document.fileName, {
        line: position.line + 1,
        column: position.character
    });
    engine.onChange((currentNode) => {
        console.log("current", currentNode);
        highlightRange({
            startIndex: currentNode.range[0],
            endIndex: currentNode.range[1]
        });
    });
    engine.start();
};

const speakDocument = (editor: vscode.TextEditor) => {
    const engine = new SpeechEngine(editor.document.getText(), editor.document.fileName);
    engine.onChange((currentNode) => {
        console.log("current", currentNode);
        highlightRange({
            startIndex: currentNode.range[0],
            endIndex: currentNode.range[1]
        });
    });
    engine.start();
};


export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerTextEditorCommand('speech.speakDocument', (editor) => {
        stopSpeaking();
        if (!editor)
            return;
        speakDocument(editor);
    }));

    context.subscriptions.push(vscode.commands.registerTextEditorCommand('speech.speakSelection', (editor) => {
        stopSpeaking();
        if (!editor)
            return;
        speakCurrentSelection(editor);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('speech.stopSpeaking', () => {
        stopSpeaking();
    }));
}