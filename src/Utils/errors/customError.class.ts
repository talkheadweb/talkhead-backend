class CustomError extends Error {
    statusCode: number;
    stack: string = "";

    constructor(message: string, statusCode: number, stack?: string) {
        super(message)
        this.statusCode = statusCode
        if (stack) {
            this.stack = stack
        } else {
            Error.captureStackTrace(this, this.constructor)
        }
    }
}

export default CustomError