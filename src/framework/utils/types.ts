// biome-ignore lint: *
export type Known = any;

const emptyObject = {};

export type EmptyObject = typeof emptyObject;

export type StrictEmptyObject = Record<string, never>;
