// The real driver is a native add-on that downloads IBM's CLI driver; unit
// tests drive `open` with fake connections instead.
export const open = jest.fn();

export default { open };
