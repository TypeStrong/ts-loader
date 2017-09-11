class Shape {
    /** x and y refer to the center of the shape */
    constructor(public x: number, public y: number) {
    }

    moveTo(x: number, y: number) {
        this.x = x;
        this.y = y;
    }

    fillColor: '#123456';

    borderColor: '#555555';

    borderWidth: 1;
}

export = Shape;