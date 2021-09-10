type Mutable<T> = {
    -readonly [P in keyof T]: T[P];
};

export function clone<T>(val: T): Mutable<T> {
    return val as Mutable<T>;
}