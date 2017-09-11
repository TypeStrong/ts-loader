import Shape = require('./Shape');

class Circle extends Shape {
    constructor(x: number, y: number, public radius: number) {
        super(x, y);
    }
}

export = Circle;