//@ts-check
import controller from './controller';

export default function render() {
    controller.setMessage("Hello World!");
    document.getElementById('wrapper').innerHTML = controller.getHtml();
}
