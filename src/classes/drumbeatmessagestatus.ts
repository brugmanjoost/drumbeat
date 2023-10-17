export enum DrumbeatMessageStatus {
    Pending                     /**/ = 'pending',
    Cancelled                   /**/ = 'cancelled',
    Completed                   /**/ = 'completed',
    Failed                      /**/ = 'failed',
}

export namespace DrumbeatMessageStatus {
    const map: { [key in DrumbeatMessageStatus]: number } = {
        [DrumbeatMessageStatus.Pending]:        /**/ 1,
        [DrumbeatMessageStatus.Cancelled]:      /**/ 2,
        [DrumbeatMessageStatus.Completed]:      /**/ 3,
        [DrumbeatMessageStatus.Failed]:         /**/ 4,
    };

    export function isValid(status: any): boolean {
        if (typeof status !== 'string') return false;
        return status in map;
    }

    export function serialize(status: DrumbeatMessageStatus): number {
        return map[status];
    }

    export function deserialize(status: number): DrumbeatMessageStatus {
        for (var key in map) {
            const castKey = key as DrumbeatMessageStatus;
            if (map[castKey] === status) return castKey;
        }
        throw 'Not found';
    }

}
