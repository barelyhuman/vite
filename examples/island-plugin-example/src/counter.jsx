import { useState } from "preact/hooks";

export const Counter = () => {
	const [count, setCount] = useState(0);
	return (
		<>
			Count:
			<button type="button" onClick={() => setCount(count + 1)}>
				{count}
			</button>
		</>
	);
};
