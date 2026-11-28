module.exports = {
    mode: 'development',
    entry: './src/app.ts',
    output: {
        filename: 'bundle.js'
    },
    resolve: {
        extensions: ['.ts', 'tsx', '.js']
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/, loader: 'ts-loader', options: {
                    // patterns with a folder in them: on Windows the path
                    // they are matched against has backslashes
                    reportFiles: [ 'src/**/*.ts', '!src/skip.ts' ]
                }
            }
        ]
    }
}
