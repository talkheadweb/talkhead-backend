
export const ServiceList = [
    {
        name: 'Network',
        code: 'NETWORK',
        description: 'Network related logs'
    },
    {
        name: 'System Default',
        code: 'SYSTEM',
        description: 'System default logs'
    },
    {
        name: 'Application Logs',
        code: 'APPLICATION',
        description: 'Application logs'
    },
    {
        name: 'Redis Logs',
        code: 'REDIS',
        description: 'Redis logs'
    },
    {
        name: 'Database Logs',
        code: 'DATABASE',
        description: 'Database logs'
    },
    {
        name: 'Auth Module',
        code: 'AUTH',
        description: 'Auth module related logs'
    }
] as const

export type TServiceItem = typeof ServiceList[number]
export type TServiceCode = TServiceItem['code']
export const DefaultLogService: TServiceCode = "SYSTEM"

export const ServiceCode = Object.freeze(
    Object.fromEntries(ServiceList.map(s => [s.code, s.code])) as { [K in TServiceCode]: K }
)

