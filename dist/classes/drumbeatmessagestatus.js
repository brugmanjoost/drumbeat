"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DrumbeatMessageStatus = void 0;
var DrumbeatMessageStatus;
(function (DrumbeatMessageStatus) {
    DrumbeatMessageStatus["Pending"] = "pending";
    DrumbeatMessageStatus["Cancelled"] = "cancelled";
    DrumbeatMessageStatus["Completed"] = "completed";
    DrumbeatMessageStatus["Failed"] = "failed";
})(DrumbeatMessageStatus || (exports.DrumbeatMessageStatus = DrumbeatMessageStatus = {}));
(function (DrumbeatMessageStatus) {
    const map = {
        [DrumbeatMessageStatus.Pending]: /**/ 1,
        [DrumbeatMessageStatus.Cancelled]: /**/ 2,
        [DrumbeatMessageStatus.Completed]: /**/ 3,
        [DrumbeatMessageStatus.Failed]: /**/ 4,
    };
    function isValid(status) {
        if (typeof status !== 'string')
            return false;
        return status in map;
    }
    DrumbeatMessageStatus.isValid = isValid;
    function serialize(status) {
        return map[status];
    }
    DrumbeatMessageStatus.serialize = serialize;
    function deserialize(status) {
        for (var key in map) {
            const castKey = key;
            if (map[castKey] === status)
                return castKey;
        }
        throw 'Not found';
    }
    DrumbeatMessageStatus.deserialize = deserialize;
})(DrumbeatMessageStatus || (exports.DrumbeatMessageStatus = DrumbeatMessageStatus = {}));
//# sourceMappingURL=drumbeatmessagestatus.js.map