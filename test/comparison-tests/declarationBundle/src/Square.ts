import Shape = require('./Shape');

class Square extends Shape {
    constructor(x: number, y: number, public sideLength: number) {
        super(x, y);
    }
}

export = Square;