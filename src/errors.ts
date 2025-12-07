export function pluginNotEnabled(){
    return new Error("This feature requires the appropriate plugin to be enabled.");
}