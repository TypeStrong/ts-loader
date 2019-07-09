import dep = require('./sub/dep');
declare class Test extends dep {
    doSomething(): void;
}
export = Test;
