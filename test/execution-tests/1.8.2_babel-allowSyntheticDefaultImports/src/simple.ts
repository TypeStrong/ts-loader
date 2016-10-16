import mathutils from "mathutils";

export function usingMathutils() {
    return `with ${ mathutils.version } we can make ${ mathutils.adder(3, 4) }`;
}
