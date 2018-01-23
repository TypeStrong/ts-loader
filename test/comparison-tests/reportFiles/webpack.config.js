module.exports = {
    mode: 'development',
    entry: './app.ts',
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
                    reportFiles: [ '**/*.ts', '!skip.ts' ]
                }
            }
        ]
    }
}