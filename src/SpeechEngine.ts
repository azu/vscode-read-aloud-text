import * as say from "say";
import { TxtNode, TxtParentNode, ASTNodeTypes } from "@textlint/ast-node-types";
import { createParser } from "./parser";
import { traverse, VisitorOption } from "@textlint/ast-traverse";
import { splitAST, Syntax as SentenceSyntax } from "sentence-splitter";
const StringSource = require("textlint-util-to-string");
import PQueue from "p-queue";
import { EventEmitter } from "events";

const StructuredSource = require("structured-source");
/**
 *  Line number starts with 1.
 *  Column number starts with 0.
 */
export type SpeechEnginePosition = { line: number; column: number };
export class SpeechEngine extends EventEmitter {
    private txtAST: TxtNode | { text: string; ast: TxtNode };
    private txtNodes: TxtNode[];
    private speechIndex: number;
    private promiseQueue: PQueue;
    public status: "pause" | "play" | "stop" = "stop";
    constructor(
        private text: string,
        filePath: string,
        loc?: {
            start: SpeechEnginePosition;
            end?: SpeechEnginePosition;
        }
    ) {
        super();
        const structuredSource = new StructuredSource(text);
        const positionToIndex = (position: { line: number; column: number }): number => {
            return structuredSource.positionToIndex(position);
        };
        const startIndex = loc ? positionToIndex(loc.start) : null;
        const endIndex = loc ? (loc.end ? positionToIndex(loc.end) : Infinity) : null;
        const parser = createParser([
            {
                pluginId: "text",
                plugin: require("@textlint/textlint-plugin-text").default
            },
            {
                pluginId: "markdown",
                plugin: require("@textlint/textlint-plugin-markdown").default
            },
            {
                pluginId: "review",
                plugin: require("textlint-plugin-review")
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
        };
        traverse(this.txtAST as TxtParentNode, {
            enter(node) {
                if (!isIncludedNode(node)) {
                    return;
                }
                if (
                    node.type === ASTNodeTypes.Paragraph ||
                    node.type === ASTNodeTypes.Header ||
                    node.type === "TableCell"
                ) {
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
                if (node.type === ASTNodeTypes.Str) {
                    txtNodes.push(node);
                }
            }
        });
        this.txtNodes = txtNodes;
        this.promiseQueue = new PQueue({ concurrency: 1 });
    }

    onChange(handler: (currentSpeechNode: TxtNode) => void) {
        this.on("CHANGE", (index: number) => {
            console.log("currentIndex", index);
            handler(this.txtNodes[index]);
        });
    }

    start(voice: string, speed: number) {
        this.status = "play";
        this.txtNodes.slice(this.speechIndex).forEach((node: TxtNode | TxtParentNode, index) => {
            // StringSource can handle ParentNode
            const text: string = node.children ? new StringSource(node).toString() : node.raw;
            this.promiseQueue.add(() => {
                this.emit("CHANGE", this.speechIndex);
                return speakText(text, voice, speed)
                    .then(() => {
                        // update index after finishing speech
                        this.speechIndex++;
                    })
                    .catch(error => {
                        console.log("oh");
                        this.speechIndex++;
                    });
            });
        });
    }

    pause() {
        this.status = "pause";
        this.promiseQueue.clear();
        this.removeAllListeners();
        stopSpeaking();
    }

    reset() {
        this.status = "stop";
        this.promiseQueue.clear();
        this.removeAllListeners();
        stopSpeaking();
        this.speechIndex = 0;
    }
}

const stopSpeaking = () => {
    say.stop();
};

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
