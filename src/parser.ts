import {
    TextlintKernel,
    TextlintKernelPlugin,
    TextlintResult,
    TextlintPluginDescriptors,
    TextlintPluginDescriptor,
    TextlintRuleOptions
} from "@textlint/kernel";
import * as path from "path";
export const createParser = (plugins: TextlintKernelPlugin[] = []) => {
    const textlintPluginDescriptors = plugins.map(plugin => {
        return new TextlintPluginDescriptor(plugin);
    });
    const pluginDescriptors = new TextlintPluginDescriptors(textlintPluginDescriptors);
    return {
        parse(text: string, filePath: string) {
            const ext = path.extname(filePath);
            const plugin = pluginDescriptors.findPluginDescriptorWithExt(ext);
            if (!plugin) {
                throw new Error("Anyone does not support ext" + ext);
            }
            return plugin.processor.processor(ext).preProcess(text, filePath);
        }
    };
};
