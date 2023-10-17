export declare enum DrumbeatMessageStatus {
    Pending = "pending",
    Cancelled = "cancelled",
    Completed = "completed",
    Failed = "failed"
}
export declare namespace DrumbeatMessageStatus {
    function isValid(status: any): boolean;
    function serialize(status: DrumbeatMessageStatus): number;
    function deserialize(status: number): DrumbeatMessageStatus;
}
