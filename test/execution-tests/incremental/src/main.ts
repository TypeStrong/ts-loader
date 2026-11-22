class Foo {
    private message: string;
    constructor() {
        this.message = 'hello world';
    }
    public write() {
        console.log(this.message);
    }
}
export default Foo;