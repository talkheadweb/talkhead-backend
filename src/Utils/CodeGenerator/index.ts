import CustomError from "../errors/customError.class";
import { ECodeGeneratorCharset, TCodeGeneratorConfig, TSingleCodeGenerator } from "./types";


const placeholder = '#';

const size = (fn: any, array: any): number => {
    return fn ? [...array].filter((x) => fn(x)).length : array.length;
}

const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomElement = (array: any) => array[randomInt(0, array.length - 1)];

const charsets: {
    [key: string]: string
} = {
    numbers: '0123456789',
    alphabetic: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
    alphanumeric: '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
};
const Charset = (name: ECodeGeneratorCharset) => charsets[name];
const createConfig = (config: TCodeGeneratorConfig) => {
    return {
        count: config.count ?? 1,
        length: config.length ?? 8,
        charset: config.charset,
        prefix: config.prefix ?? '',
        postfix: config.postfix ?? '',
        pattern: config.pattern ?? placeholder.repeat(config.length ?? 8),
    }
};

const generateOne = (payload: TSingleCodeGenerator) => {
    const { charset, pattern, prefix, postfix } = createConfig(payload);
    let code = '';
    for (const p of pattern) {
        const modifiedCharset = Charset(charset as ECodeGeneratorCharset)
        const c = p === placeholder ? randomElement(modifiedCharset) : p;
        code += c;
    }
    return `${prefix ?? ""}${code}${postfix ?? ""}`;
};
const isFeasible = (charset: string, pattern: string, count: number) => {
    return charset.length ** size((x: string) => x === placeholder, pattern) >= count;
};

/**
 * Generates an array of unique codes based on the provided configuration
 * 
 * @param config - Configuration object for code generation
 * @param config.charset - Character set to use (NUMBERS | ALPHABETIC | ALPHANUMERIC), Enum: ECodeGeneratorCharset
 * @param config.pattern - Pattern for code generation. Use '#' as placeholder for random characters
 * @param config.count - Number of unique codes to generate, Default: 1
 * @param config.length - Length of the code (used only if pattern is not provided). Default: 8
 * @param config.prefix - String to prepend to the generated code
 * @param config.postfix - String to append to the generated code
 * 
 * @returns An array of unique generated codes
 * 
 * @example
 * const codes = CodeGeneratorUtils.generate({
 *    charset: ECodeGeneratorCharset.ALPHANUMERIC,
 *    pattern: "###-###",    // Will generate pattern like "A1B-C2D"
 *    count: 10,             // Generate 10 unique codes
 *    prefix: "ID-",         // Optional prefix
 *    postfix: "-2024"       // Optional postfix
 * });
 *  * 
 * @throws {Error} When it's not possible to generate the requested number of unique codes
 */
const generate = (config: TCodeGeneratorConfig): string[] => {
    const validatedConfig = createConfig(config);
    const { charset, count, pattern } = validatedConfig;
    if (!isFeasible(charset as string, pattern, count)) {
        throw new CustomError('Not possible to generate requested number of codes.', 400);
    }
    const codes = new Set<string>();
    while (codes.size < count) {
        codes.add(generateOne({
            ...validatedConfig,
        }));
    }
    return [...codes];
};

export const CodeGeneratorUtils = {
    generate,
    generateOne
}


// const placeholder = '#';

// const size = (fn: any, array: any): number => {
//     return fn ? [...array].filter((x) => fn(x)).length : array.length;
// }

// const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
// const randomElement = (array: any) => array[randomInt(0, array.length - 1)];

// const charsets: {
//     [key: string]: string
// } = {
//     numbers: '0123456789',
//     alphabetic: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
//     alphanumeric: '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
// };
// const Charset = (name: ECodeGeneratorCharset) => {
//     // console.log('line 21', { name, a: charsets[name] });
//     return charsets[name]
// };
// const createConfig = (config: TCodeGeneratorConfig) => {
//     return {
//         count: config.count ?? 1,
//         length: config.length ?? 8,
//         charset: config.charset,
//         prefix: config.prefix ?? '',
//         postfix: config.postfix ?? '',
//         pattern: config.pattern ?? placeholder.repeat(config.length ?? 8),
//     }
// };
// const generateOne = ({ pattern, charset, prefix, postfix }: {
//     charset: string;
//     prefix: string;
//     postfix: string;
//     pattern: string;
// }) => {
//     let code = '';
//     for (const p of pattern) {
//         const modifiedCharset = Charset(charset as ECodeGeneratorCharset)
//         const c = p === placeholder ? randomElement(modifiedCharset) : p;
//         code += c;
//     }
//     return `${prefix}${code}${postfix}`;
// };
// const isFeasible = (charset: string, pattern: string, count: number) => {
//     return charset.length ** size((x: string) => x === placeholder, pattern) >= count;
// };

// const generate = (config: TCodeGeneratorConfig): string[] => {
//     const validatedConfig = createConfig(config);
//     const { charset, count, pattern } = validatedConfig;
//     if (!isFeasible(charset as string, pattern, count)) {
//         throw new CustomError('Not possible to generate requested number of codes.', 400);
//     }
//     const codes = new Set<string>();
//     while (codes.size < count) {
//         codes.add(generateOne({
//             ...validatedConfig,
//             charset: charset as string
//         }));
//     }
//     return [...codes];
// };

// export const CodeGeneratorUtils = {
//     generate,
//     generateOne
// }