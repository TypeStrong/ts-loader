class Foo {
    private message: string;
    constructor() {
        this.message = 'hello world';
    }
    public write() {
        // tslint:disable-next-line:no-console
        console.log(this.message);
    }
}
export default Foo;