type Mutable<T> = {
    -readonly [P in keyof T]: T[P];
};

export declare function clone<T>(val: T): Mutable<T>; // , keyof T