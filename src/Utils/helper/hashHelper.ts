import bcrypt from "bcryptjs";
import config from "@/Config";

const comparePassword = async (password: string, hashPassword: string): Promise<boolean> => {
    const result = await bcrypt.compare(password, hashPassword)
    return result
}

const generateHashPassword = async (password: string): Promise<string> => {
    const hash = await bcrypt.hash(password, Number(config.bcrypt_saltRounds))
    return hash
}

export const HashHelper = {
    comparePassword,
    generateHashPassword
}