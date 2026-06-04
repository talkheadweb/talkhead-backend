// import Config from '@/Config';
// import nodemailer, { SendMailOptions, Transporter } from 'nodemailer';
// import CustomError from '../errors/customError.class';

// // Email configuration interface
// interface EmailConfig {
//     host: string;
//     port: number;
//     secure: boolean;
//     auth: {
//         user: string;
//         pass: string;
//     };
// }

// // Email payload interface
// interface EmailPayload {
//     from?: string;
//     to: string | string[];
//     cc?: string | string[];
//     bcc?: string | string[];
//     subject: string;
//     text?: string;
//     html?: string;
//     attachments?: Array<{
//         filename: string;
//         path?: string;
//         content?: Buffer | string;
//         contentType?: string;
//     }>;
// }

// // Module-level state
// let transporter: Transporter | null = null;
// const defaultFrom = `${Config.appName}<${Config.mail.nodemailer.user}>`;

// // Pure function to get SMTP configuration
// const getSMTPConfig = (): EmailConfig | null => {
//     const host = Config.mail.nodemailer.host;
//     const port = Config.mail.nodemailer.port;
//     const user = Config.mail.nodemailer.user;
//     const pass = Config.mail.nodemailer.pass;

//     if (!host || !port || !user || !pass) {
//         return null;
//     }

//     return {
//         host,
//         port,
//         secure: Config.mail.nodemailer.secure, // true for 465, false for other ports
//         auth: {
//             user,
//             pass,
//         },
//     };
// };

// // Function to verify connection
// const verifyConnection = async (transporterInstance: Transporter): Promise<void> => {
//     try {
//         await transporterInstance.verify();
//         console.log('SMTP server connection verified successfully');
//     } catch (error) {
//         console.error('SMTP server connection failed:', error);
//         throw new CustomError('SMTP server connection failed', 500);
//     }
// };

// // Function to initialize transporter
// const initializeTransporter = (): Transporter | null => {
//     try {
//         const smtpConfig = getSMTPConfig();

//         if (!smtpConfig) {
//             console.warn('SMTP configuration not found. Nodemailer will not be initialized.');
//             return null;
//         }

//         const newTransporter = nodemailer.createTransport(smtpConfig);

//         // Verify connection configuration (non-blocking)
//         verifyConnection(newTransporter).catch(error => {
//             console.error('Connection verification failed:', error);
//         });

//         return newTransporter;
//     } catch (error) {
//         console.error('Failed to initialize Nodemailer:', error);
//         throw new CustomError('Email service initialization failed', 500);
//     }
// };

// // Function to get or create transporter
// const getTransporter = (): Transporter => {
//     if (!transporter) {
//         transporter = initializeTransporter();
//     }

//     if (!transporter) {
//         throw new CustomError('Email service not initialized. Please check SMTP configuration.', 500);
//     }

//     return transporter;
// };

// // Core send mail function
// const sendMail = async (payload: EmailPayload): Promise<any> => {
//     const transporterInstance = getTransporter();

//     try {
//         const mailOptions: SendMailOptions = {
//             from: payload.from || defaultFrom,
//             to: payload.to,
//             cc: payload.cc,
//             bcc: payload.bcc,
//             subject: payload.subject,
//             text: payload.text,
//             html: payload.html,
//             attachments: payload.attachments,
//         };

//         const result = await transporterInstance.sendMail(mailOptions);

//         console.log('Email sent successfully:', result.messageId);
//         return {
//             success: true,
//             messageId: result.messageId,
//             response: result.response,
//         };
//     } catch (error: any) {
//         console.error('Failed to send email:', error);
//         throw new CustomError(`Failed to send email: ${error.message}`, 500);
//     }
// };

// // Send HTML email function
// const sendHTMLMail = async (payload: EmailPayload): Promise<any> => {
//     return sendMail({
//         ...payload,
//         html: payload.html,
//     });
// };

// // Send plain text email function
// const sendTextMail = async (payload: EmailPayload): Promise<any> => {
//     return sendMail({
//         ...payload,
//         text: payload.text,
//     });
// };

// // Send email with attachments function
// const sendMailWithAttachments = async (payload: EmailPayload): Promise<any> => {
//     if (!payload.attachments || payload.attachments.length === 0) {
//         throw new CustomError('No attachments provided', 400);
//     }

//     return sendMail(payload);
// };

// // Test email configuration function
// const testConnection = async (): Promise<boolean> => {
//     try {
//         const transporterInstance = getTransporter();
//         await verifyConnection(transporterInstance);
//         return true;
//     } catch (error) {
//         return false;
//     }
// };

// // Get transporter info function
// const getTransporterInfo = (): any => {
//     if (!transporter) {
//         return { status: 'Not initialized' };
//     }

//     return {
//         status: 'Initialized',
//         options: {
//             host: process.env.SMTP_HOST,
//             port: process.env.SMTP_PORT,
//             secure: process.env.SMTP_SECURE === 'true',
//             user: process.env.SMTP_USER,
//         },
//     };
// };

// // Reset transporter function (useful for testing or reconfiguration)
// const resetTransporter = (): void => {
//     if (transporter) {
//         transporter.close();
//         transporter = null;
//     }
// };

// // Export utility functions
// export const NodemailerUtils = {
//     sendMail,
//     sendHTMLMail,
//     sendTextMail,
//     sendMailWithAttachments,
//     testConnection,
//     getTransporterInfo,
//     resetTransporter,
// };

// // Export types
// export type { EmailConfig, EmailPayload };