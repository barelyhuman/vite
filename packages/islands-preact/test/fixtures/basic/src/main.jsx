import { Counter } from "./counter";
import { Counter as Counter2 } from "./another-counter";

export const App = () => {
	return <>
		<Counter />
		<Counter2 />
	</>;
};
