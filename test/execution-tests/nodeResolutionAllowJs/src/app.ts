import { format, parse} from "date-fns";

export function thisShouldNotError() {
    return format(new Date(), "dd-MM-yyyy");
}
