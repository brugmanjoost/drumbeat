import { Request, Response, NextFunction } from 'express';
import { DrumbeatMessageStatus } from './drumbeatmessagestatus';
import { DrumbeatResponseStatus } from './drumbeatresponsestatus';
import { DrumbeatMessage } from './drumbeatmessage';
interface DrumbeatServerOptions {
    host: string;
    database: string;
    user: string;
    password?: string;
    ssl: boolean;
    waitForConnections: boolean;
    connectionLimit: number;
    queueLimit: number;
    tokens: DrumbeatTokenDefinition[];
}
interface DrumbeatTokenDefinition {
    token: string;
    queue: string;
    isAdmin: boolean;
    isWorker: boolean;
}
type HandlerParameterList = (':queue' | ':id' | 'queryStatus' | 'bodySubject' | 'bodyStatus')[];
export declare class DrumbeatServer {
    #private;
    constructor(opts: DrumbeatServerOptions);
    dbApplyBodies(record: DrumbeatMessage): void;
    dbCreate(queue: string, subject: string, requestBody: any): Promise<number>;
    dbGet(queue: string, id: number): Promise<DrumbeatMessage | undefined>;
    dbDelete(id: number): Promise<void>;
    dbFeedback(id: number, status: DrumbeatMessageStatus, responseBody?: any): Promise<void>;
    dbGetPendingBySubject(queue: string, subject: string): Promise<DrumbeatMessage | undefined>;
    dbList(queue: string, status?: DrumbeatMessageStatus): Promise<DrumbeatMessage[]>;
    dbCancel(id: number): Promise<void>;
    httpAccessDenied(res: Response, result?: DrumbeatResponseStatus): void;
    httpBadRequest(res: Response, result?: DrumbeatResponseStatus): void;
    httpNotFound(res: Response): void;
    httpOk(res: Response, data?: any): void;
    paramQueue(req: Request): string | undefined;
    paramId(req: Request): number | undefined;
    paramQueryStatus(req: Request): DrumbeatMessageStatus | undefined;
    paramBodyStatus(req: Request): DrumbeatMessageStatus | undefined;
    paramBodySubject(req: Request): string | undefined;
    requireParameters(req: Request, res: Response, next: NextFunction, parameters: HandlerParameterList): void;
    messageFromParamQueueAndId(req: Request, res: Response): Promise<DrumbeatMessage | undefined>;
    authGetToken(req: Request): string | undefined;
    authIsWorker(req: Request): boolean;
    authIsAdmin(req: Request): boolean;
    handleAuthRequireAdmin(req: Request, res: Response, next: NextFunction): Promise<void>;
    handleAuthRequireWorker(req: Request, res: Response, next: NextFunction): Promise<void>;
    handleAuthRequireAdminOrWorker(req: Request, res: Response, next: NextFunction): Promise<void>;
    handleRequestCreate(req: Request, res: Response, next: NextFunction): Promise<void>;
    handleRequestGet(req: Request, res: Response, next: NextFunction): Promise<void>;
    handleRequestDelete(req: Request, res: Response, next: NextFunction): Promise<void>;
    handleRequestCancel(req: Request, res: Response, next: NextFunction): Promise<void>;
    handleRequestList(req: Request, res: Response, next: NextFunction): Promise<void>;
    handleRequestPostback(req: Request, res: Response, next: NextFunction): Promise<void>;
}
export {};
