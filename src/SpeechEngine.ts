import * as say from 'say';
import { TxtNode, TxtParentNode, ASTNodeTypes } from "@textlint/ast-node-types";
import { createParser } from './parser';
import { traverse, VisitorOption } from "@textlint/ast-traverse";
import { splitAST, Syntax as SentenceSyntax } from "sentence-splitter"
const StringSource = require("textlint-util-to-string");
import PQueue = require('p-queue');
import { EventEmitter } from 'events';

import StructuredSource = require("structured-source");
/**
 *  Line number starts with 1.
 *  Column number starts with 0.
 */
export type SpeechEnginePosition = { line: number, column: number }
export class SpeechEngine extends EventEmitter {
    private txtAST: TxtNode;
    private txtNodes: TxtNode[];
    private speechIndex: number;
    private promiseQueue: PQueue<PQueue.DefaultAddOptions>;
    constructor(private text: string, filePath: string, loc?: {
        start: SpeechEnginePosition,
        end: SpeechEnginePosition
    }) {
        super();
        const structuredSource = new StructuredSource(text);
        const positionToIndex = (position: { line: number; column: number }): number => {
            return structuredSource.positionToIndex(position);
        }
        const startIndex = loc ? positionToIndex(loc.start) : null;
        const endIndex = loc ? positionToIndex(loc.end) : null;
        const parser = createParser([
            {
                pluginId: "markdown",
                plugin: require("@textlint/textlint-plugin-markdown")
            }
        ]);
        this.speechIndex = 0;
        this.txtAST = parser.parse(text, filePath);
        const txtNodes: TxtNode[] = [];
        const isIncludedNode = (node: TxtNode): boolean => {
            if (!startIndex || !endIndex) {
                return true;
            }
            // Node range
            // |------------------|  <- A
            //                    |----| <- B
            //                         |------------------| <- C
            //        |//////////////////////////|  <- Selection
            //        ^                          ^
            //     startIndex                 endIndex     
            // Pattern D
            //  |-------|
            //    |///|
            const nodeStartIndex = node.range[0];
            const nodeEndIndex = node.range[1];
            // Pattern A
            if (startIndex <= nodeEndIndex && nodeEndIndex <= endIndex) {
                return true;
            }
            // Pattern B
            if (startIndex <= nodeStartIndex && nodeEndIndex <= endIndex) {
                return true;
            }
            // Pattern C
            if (startIndex <= nodeStartIndex && nodeStartIndex <= endIndex) {
                return true;
            }
            // Pattern D
            if (nodeStartIndex <= startIndex && endIndex <= nodeEndIndex) {
                return true;
            }
            return false;
        }
        traverse(this.txtAST as TxtParentNode, {
            enter(node) {
                if (!isIncludedNode(node)) {
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
                        if (!isIncludedNode(node)) {
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
        console.log("txtNodes", txtNodes);
        this.txtNodes = txtNodes;
        this.promiseQueue = new PQueue({ concurrency: 1 });
    }

    onChange(handler: (currentSpeechNode: TxtNode) => void) {
        this.on("CHANGE", (index: number) => {
            handler(this.txtNodes[index]);
        });
    }

    start(voice: string, speed: number) {
        this.txtNodes.slice(this.speechIndex).forEach((node: TxtNode | TxtParentNode, index) => {
            // StringSource can handle ParentNode
            const text: string = node.children ? new StringSource(node).toString() : node.raw;
            this.promiseQueue.add(() => {
                this.emit("CHANGE", this.speechIndex);
                return speakText(text, voice, speed).then(() => {
                    // update index after finishing speech
                    this.speechIndex++;
                });
            });
        });
    }

    pause() {
        this.promiseQueue.clear();
        this.removeAllListeners();
        return stopSpeaking();
    }

    reset() {
        this.pause();
        this.speechIndex = 0;
    }
}

const stopSpeaking = () => {
    say.stop();
}

const speakText = (text: string, voice: string, speed: number): Promise<void> => {
    text = text.trim();
    if (text.length > 0) {
        return new Promise((resolve, reject) => {
            say.speak(text, voice, speed, (error: any) => {
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