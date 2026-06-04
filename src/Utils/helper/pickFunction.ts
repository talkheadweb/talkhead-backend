/*
* T = Type (Object Type)
* K = keys
* */

export const pickFunction = <T extends object, k extends keyof T>(data: T, keys: k[]): Partial<T> => {
    let result: Partial<T> = {};
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (data && data.hasOwnProperty?.call(data, key) && (data[key] !== undefined)) {
            result[key] = data[key];
        }
    }
    return result;
}