declare module MyApp
{
	const _default: {
	    Circle: typeof Circle;
	    Square: typeof Square;
	};

	class Circle extends Shape {
	    radius: number;
	    constructor(x: number, y: number, radius: number);
	}

	class Shape {
	    x: number;
	    y: number;
	    /** x and y refer to the center of the shape */
	    constructor(x: number, y: number);
	    moveTo(x: number, y: number): void;
	    fillColor: '#123456';
	    borderColor: '#555555';
	    borderWidth: 1;
	}

	class Square extends Shape {
	    sideLength: number;
	    constructor(x: number, y: number, sideLength: number);
	}

}