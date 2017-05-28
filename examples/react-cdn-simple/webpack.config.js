'use strict';

module.exports = {
    entry: './src/index.tsx',
    output: { filename: 'index.js' },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                loader: 'ts-loader',
                options: {
                    transpileOnly: true
                }
            }
        ]
    },
    resolve: {
        extensions: [ '.ts', '.tsx', 'js' ]
    },
    externals: {
        'react': 'React',
        'react-dom': 'ReactDOM'
    }
};
