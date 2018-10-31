const fs = require("fs");
const path = require("path");
const webpack = require("webpack");
const MemoryFS = require("memory-fs");
const { ufs } = require("unionfs");

const config = {
    devtool: 'inline-source-map',
    mode: "development",
    entry: "/someplace-somewhere/index.ts",
    output: {
        path: path.join(__dirname, "dist")
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                loader: path.join(__dirname, "..", "..", "dist")
            }
        ]
    },
    resolve: {
        extensions: [ '.ts', '.tsx', '.js' ]
    }
};

const compiler = webpack(config);

const memoryfs = new MemoryFS();

memoryfs.writeFileSync("/tsconfig.json", fs.readFileSync("./tsconfig.json"));

memoryfs.mkdirpSync("/someplace-somewhere");
memoryfs.writeFileSync("/someplace-somewhere/index.ts", fs.readFileSync("./data/index.ts"));
memoryfs.writeFileSync("/someplace-somewhere/render.ts", fs.readFileSync("./data/render.ts"));

// ufs works as a stack, so this actually uses memoryfs first, 
// then the real fs if we fail to find anything in memoryfs
const inputFS = ufs
    .use(fs) 
    .use(memoryfs)

compiler.inputFileSystem = inputFS;

compiler.run((err, stats) => {
    if (err) {
        throw new Error(err);
    }

    console.log(stats.toString());
})